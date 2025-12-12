export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import * as XLSX from "xlsx";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CampaignType, LeadStatus, Office, Role } from "@prisma/client";

type NormalizedRow = Record<string, string>;

const COCKPIT_KEYS = {
  UF: ["UF"],
  CIDADE: ["CIDADE"],
  DOCUMENTO: ["DOCUMENTO", "CNPJ"],
  EMPRESA: ["EMPRESA", "RAZAO_SOCIAL", "RAZÃO_SOCIAL"],
  CD_CNAE: ["CD_CNAE", "CNAE"],
  VL_FAT_PRESUMIDO: ["VL_FAT_PRESUMIDO", "VL FAT PRESUMIDO"],
  TELEFONE1: ["TELEFONE1", "TELEFONE 1"],
  TELEFONE2: ["TELEFONE2", "TELEFONE 2"],
  TELEFONE3: ["TELEFONE3", "TELEFONE 3"],
  LOGRADOURO: ["LOGRADOURO"],
  TERRITORIO: ["TERRITORIO", "TERRITÓRIO"],
  OFERTA_MKT: ["OFERTA_MKT", "OFERTA MKT", "OFERTA"],
  CEP: ["CEP"],
  NUMERO: ["NUMERO"],
  ESTRATEGIA: ["ESTRATEGIA"],
  ARMARIO: ["ARMARIO", "ARMÁRIO"],
  ID_PRUMA: ["ID_PRUMA", "ID PRUMA"],
  VERTICAL: ["VERTICAL"],
};

const MAPA_PARQUE_KEYS = {
  NR_CNPJ: ["NR_CNPJ", "CNPJ"],
  NM_CLIENTE: ["NM_CLIENTE", "CLIENTE", "RAZAO_SOCIAL", "RAZÃO_SOCIAL", "EMPRESA"],
  TP_PRODUTO: ["TP_PRODUTO"],
  QT_MOVEL_TERM: ["QT_MOVEL_TERM"],
  QT_MOVEL_PEN: ["QT_MOVEL_PEN"],
  QT_MOVEL_M2M: ["QT_MOVEL_M2M"],
  QT_BASICA_TERM_FIBRA: ["QT_BASICA_TERM_FIBRA"],
  QT_BASICA_TERM_METALICO: ["QT_BASICA_TERM_METALICO"],
  QT_BASICA_BL: ["QT_BASICA_BL"],
  QT_BL_FTTH: ["QT_BL_FTTH"],
  QT_BL_FTTC: ["QT_BL_FTTC"],
  QT_BASICA_TV: ["QT_BASICA_TV"],
  QT_BASICA_OUTROS: ["QT_BASICA_OUTROS"],
  QT_BASICA_LINAS: ["QT_BASICA_LINAS"],
  QT_AVANCADA_DADOS: ["QT_AVANCADA_DADOS"],
  AVANCADA_VOZ: ["AVANCADA_VOZ"],
  QT_VIVO_TECH: ["QT_VIVO_TECH"],
  QT_VVN: ["QT_VVN"],
  DS_ENDERECO: ["DS_ENDERECO"],
  DS_CIDADE: ["DS_CIDADE"],
  NR_CEP: ["NR_CEP"],
  NUMERO: ["NUMERO"],
  NM_CONTATO_SFA: ["NM_CONTATO_SFA"],
  EMAIL_CONTATO_PRINCIPAL_SFA: ["EMAIL_CONTATO_PRINCIPAL_SFA"],
  CELULAR_CONTATO_PRINCIPAL_SFA: ["CELULAR_CONTATO_PRINCIPAL_SFA"],
  TLFN_1: ["TLFN_1"],
  TLFN_2: ["TLFN_2"],
  TLFN_3: ["TLFN_3"],
  TLFN_4: ["TLFN_4"],
  TLFN_5: ["TLFN_5"],
  TEL_COMERCIAL_SIEBEL: ["TEL_COMERCIAL_SIEBEL"],
  TEL_CELULAR_SIEBEL: ["TEL_CELULAR_SIEBEL"],
  TEL_RESIDENCIAL_SIEBEL: ["TEL_RESIDENCIAL_SIEBEL"],
  NOMEREDE: ["NOMEREDE"],
  VERTICAL: ["VERTICAL"],
  DATA_FIM_VTECH: ["DATA_FIM_VTECH"],
  FLG_TROCA_VTECH: ["FLG_TROCA_VTECH"],
};

function normalizeKey(key: string) {
  return key
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeRow(row: Record<string, unknown>): NormalizedRow {
  const normalized: NormalizedRow = {};
  for (const [key, value] of Object.entries(row)) {
    normalized[normalizeKey(key)] = value === undefined || value === null ? "" : String(value).trim();
  }
  return normalized;
}

function pick(row: NormalizedRow, keys: string[]) {
  for (const key of keys) {
    const v = row[key];
    if (v && v.length > 0) return v;
  }
  return "";
}

type SessionResult =
  | { session: NonNullable<Awaited<ReturnType<typeof getServerSession>>> }
  | { error: { status: number; body: Record<string, unknown> } };

async function getSessionOrFail(): Promise<SessionResult> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { error: { status: 401, body: { message: "Não autenticado." } } };
  if (session.user.role !== Role.MASTER) return { error: { status: 403, body: { message: "Apenas MASTER pode criar campanhas." } } };
  return { session };
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getSessionOrFail();
    if ("error" in auth) {
      return NextResponse.json(auth.error.body, { status: auth.error.status });
    }
    const session = auth.session;

    const formData = await req.formData();
    const nome = formData.get("nome")?.toString().trim() ?? "";
    const descricao = formData.get("descricao")?.toString().trim() ?? "";
    const campaignTypeRaw = formData.get("campaignType")?.toString().trim().toUpperCase() ?? "";
    const officeRaw = formData.get("office")?.toString().trim().toUpperCase() ?? "";
    const file = formData.get("file");

    if (!nome || !campaignTypeRaw || !officeRaw || !(file instanceof File)) {
      return NextResponse.json(
        { message: "Informe nome, tipo (COCKPIT ou MAPA_PARQUE), escritório e anexe o arquivo (.xlsx ou .csv)." },
        { status: 400 },
      );
    }

    // Aceita variações "MAPA_PARQUE", "MAPA PARQUE", "MAPA-PARQUE"
    const normalizedType = campaignTypeRaw.replace(/[^A-Z]/g, "");
    const office = (Object.values(Office) as string[]).includes(officeRaw) ? (officeRaw as Office) : null;
    if (!office) {
      return NextResponse.json({ message: "Escritório inválido." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return NextResponse.json({ message: "Arquivo sem planilhas." }, { status: 400 });
    }
    const sheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    if (!rawRows.length) {
      return NextResponse.json({ message: "Arquivo vazio." }, { status: 400 });
    }
    const normalizedRows = rawRows.map(normalizeRow);

    // Infer tipo pela planilha caso o select venha diferente
    const firstRow = normalizedRows[0] || {};
    const hasMapaHeaders = Boolean(firstRow.NR_CNPJ || firstRow.NM_CLIENTE || firstRow.TLFN_1 || firstRow.TEL_COMERCIAL_SIEBEL);
    const resolvedType =
      normalizedType.includes("MAPA") ||
      normalizedType.includes("PARQUE") ||
      normalizedType === "MAPAPARQUE" ||
      hasMapaHeaders
        ? CampaignType.MAPA_PARQUE
        : CampaignType.COCKPIT;

    const userId = (session as unknown as { user?: { id?: string } }).user?.id;

    const campanha = await prisma.campanha.create({
      data: {
        nome,
        descricao: descricao || null,
        type: resolvedType,
        tipo: resolvedType,
        office,
        createdById: userId ?? undefined,
      },
    });

    const leadsToInsert: Array<NonNullable<ReturnType<typeof buildLead>>> = [];
    normalizedRows.forEach((row) => {
      const leadData = buildLead(row, resolvedType, campanha.id, office);
      if (!leadData) return;
      leadsToInsert.push(leadData);
    });

    // Chunked insert
    const chunkSize = 1000;
    let createdCount = 0;
    if (leadsToInsert.length === 0) {
      return NextResponse.json(
        { message: "Nenhum lead válido para importar (campos ausentes).", debug: { primeiraLinha: normalizedRows[0] ?? null, tipo: resolvedType } },
        { status: 400 },
      );
    }

    for (let i = 0; i < leadsToInsert.length; i += chunkSize) {
      const chunk = leadsToInsert.slice(i, i + chunkSize);
      const res = await prisma.lead.createMany({ data: chunk });
      createdCount += res.count;
    }

    await prisma.campanha.update({
      where: { id: campanha.id },
      data: {
        totalLeads: { increment: createdCount },
        remainingLeads: { increment: createdCount },
      },
    });

    return NextResponse.json({ message: "Campanha criada com sucesso.", campanhaId: campanha.id, totalLeads: createdCount }, { status: 201 });
  } catch (error) {
    console.error("[API /campanhas/v2] Erro ao criar campanha", error);
    return NextResponse.json({ message: "Erro interno ao criar campanha." }, { status: 500 });
  }
}

function buildLead(row: NormalizedRow, type: CampaignType, campanhaId: string, office: Office) {
  if (type === CampaignType.COCKPIT) {
    const telefone1 = pick(row, COCKPIT_KEYS.TELEFONE1);
    const telefone2 = pick(row, COCKPIT_KEYS.TELEFONE2);
    const telefone3 = pick(row, COCKPIT_KEYS.TELEFONE3);
    const razaoSocial = pick(row, ["RAZAO_SOCIAL", "RAZÃO_SOCIAL", "EMPRESA"]);
    const cnpj = pick(row, ["CNPJ", "DOCUMENTO"]);
    if (!razaoSocial && !cnpj && !telefone1 && !telefone2 && !telefone3) return null;
    return {
      campanhaId,
      type,
      status: LeadStatus.NOVO,
      escritorio: office,
      UF: pick(row, COCKPIT_KEYS.UF) || null,
      CIDADE: pick(row, COCKPIT_KEYS.CIDADE) || null,
      DOCUMENTO: pick(row, COCKPIT_KEYS.DOCUMENTO) || null,
      EMPRESA: pick(row, COCKPIT_KEYS.EMPRESA) || null,
      CD_CNAE: pick(row, COCKPIT_KEYS.CD_CNAE) || null,
      VL_FAT_PRESUMIDO: pick(row, COCKPIT_KEYS.VL_FAT_PRESUMIDO) || null,
      TELEFONE1: telefone1 || null,
      TELEFONE2: telefone2 || null,
      TELEFONE3: telefone3 || null,
      LOGRADOURO: pick(row, COCKPIT_KEYS.LOGRADOURO) || null,
      TERRITORIO: pick(row, COCKPIT_KEYS.TERRITORIO) || null,
      OFERTA_MKT: pick(row, COCKPIT_KEYS.OFERTA_MKT) || null,
      CEP: pick(row, COCKPIT_KEYS.CEP) || null,
      NUMERO: pick(row, COCKPIT_KEYS.NUMERO) || null,
      ESTRATEGIA: pick(row, COCKPIT_KEYS.ESTRATEGIA) || null,
      ARMARIO: pick(row, COCKPIT_KEYS.ARMARIO) || null,
      ID_PRUMA: pick(row, COCKPIT_KEYS.ID_PRUMA) || null,
      VERTICAL_COCKPIT: pick(row, COCKPIT_KEYS.VERTICAL) || null,
      razaoSocial: razaoSocial || null,
      cnpj: cnpj || null,
      telefone: telefone1 || telefone2 || telefone3 || null,
      telefone1: telefone1 || null,
      telefone2: telefone2 || null,
      telefone3: telefone3 || null,
      cidade: pick(row, COCKPIT_KEYS.CIDADE) || null,
      vertical: pick(row, COCKPIT_KEYS.VERTICAL) || null,
      raw: row,
      emails: [],
      previousConsultants: [],
    };
  }

  // MAPA_PARQUE
  const t1 = pick(row, MAPA_PARQUE_KEYS.TLFN_1);
  const t2 = pick(row, MAPA_PARQUE_KEYS.TLFN_2);
  const t3 = pick(row, MAPA_PARQUE_KEYS.TLFN_3);
  const t4 = pick(row, MAPA_PARQUE_KEYS.TLFN_4);
  const t5 = pick(row, MAPA_PARQUE_KEYS.TLFN_5);
  const tCom = pick(row, MAPA_PARQUE_KEYS.TEL_COMERCIAL_SIEBEL);
  const tCel = pick(row, MAPA_PARQUE_KEYS.TEL_CELULAR_SIEBEL);
  const tRes = pick(row, MAPA_PARQUE_KEYS.TEL_RESIDENCIAL_SIEBEL);
  const razaoSocial = pick(row, MAPA_PARQUE_KEYS.NM_CLIENTE);
  const cnpj = pick(row, MAPA_PARQUE_KEYS.NR_CNPJ);
  if (!razaoSocial && !cnpj && !t1 && !t2 && !t3 && !t4 && !t5 && !tCom && !tCel && !tRes) return null;

  const phoneCandidates = [t1, t2, t3, t4, t5, tCom, tCel, tRes].filter(Boolean);
  const p1 = phoneCandidates[0] || null;
  const p2 = phoneCandidates[1] || null;
  const p3 = phoneCandidates[2] || null;

  return {
    campanhaId,
    type,
    status: LeadStatus.NOVO,
    escritorio: office,
    NR_CNPJ: cnpj || null,
    NM_CLIENTE: razaoSocial || null,
    TP_PRODUTO: pick(row, MAPA_PARQUE_KEYS.TP_PRODUTO) || null,
    QT_MOVEL_TERM: toInt(row, MAPA_PARQUE_KEYS.QT_MOVEL_TERM),
    QT_MOVEL_PEN: toInt(row, MAPA_PARQUE_KEYS.QT_MOVEL_PEN),
    QT_MOVEL_M2M: toInt(row, MAPA_PARQUE_KEYS.QT_MOVEL_M2M),
    QT_BASICA_TERM_FIBRA: toInt(row, MAPA_PARQUE_KEYS.QT_BASICA_TERM_FIBRA),
    QT_BASICA_TERM_METALICO: toInt(row, MAPA_PARQUE_KEYS.QT_BASICA_TERM_METALICO),
    QT_BASICA_BL: toInt(row, MAPA_PARQUE_KEYS.QT_BASICA_BL),
    QT_BL_FTTH: toInt(row, MAPA_PARQUE_KEYS.QT_BL_FTTH),
    QT_BL_FTTC: toInt(row, MAPA_PARQUE_KEYS.QT_BL_FTTC),
    QT_BASICA_TV: toInt(row, MAPA_PARQUE_KEYS.QT_BASICA_TV),
    QT_BASICA_OUTROS: toInt(row, MAPA_PARQUE_KEYS.QT_BASICA_OUTROS),
    QT_BASICA_LINAS: toInt(row, MAPA_PARQUE_KEYS.QT_BASICA_LINAS),
    QT_AVANCADA_DADOS: toInt(row, MAPA_PARQUE_KEYS.QT_AVANCADA_DADOS),
    AVANCADA_VOZ: toInt(row, MAPA_PARQUE_KEYS.AVANCADA_VOZ),
    QT_VIVO_TECH: toInt(row, MAPA_PARQUE_KEYS.QT_VIVO_TECH),
    QT_VVN: toInt(row, MAPA_PARQUE_KEYS.QT_VVN),
    DS_ENDERECO: pick(row, MAPA_PARQUE_KEYS.DS_ENDERECO) || null,
    DS_CIDADE: pick(row, MAPA_PARQUE_KEYS.DS_CIDADE) || null,
    NR_CEP: pick(row, MAPA_PARQUE_KEYS.NR_CEP) || null,
    NUMERO_MP: pick(row, MAPA_PARQUE_KEYS.NUMERO) || null,
    NM_CONTATO_SFA: pick(row, MAPA_PARQUE_KEYS.NM_CONTATO_SFA) || null,
    EMAIL_CONTATO_PRINCIPAL_SFA: pick(row, MAPA_PARQUE_KEYS.EMAIL_CONTATO_PRINCIPAL_SFA) || null,
    CELULAR_CONTATO_PRINCIPAL_SFA: pick(row, MAPA_PARQUE_KEYS.CELULAR_CONTATO_PRINCIPAL_SFA) || null,
    TLFN_1: t1 || null,
    TLFN_2: t2 || null,
    TLFN_3: t3 || null,
    TLFN_4: t4 || null,
    TLFN_5: t5 || null,
    TEL_COMERCIAL_SIEBEL: pick(row, MAPA_PARQUE_KEYS.TEL_COMERCIAL_SIEBEL) || null,
    TEL_CELULAR_SIEBEL: pick(row, MAPA_PARQUE_KEYS.TEL_CELULAR_SIEBEL) || null,
    TEL_RESIDENCIAL_SIEBEL: pick(row, MAPA_PARQUE_KEYS.TEL_RESIDENCIAL_SIEBEL) || null,
    NOMEREDE: pick(row, MAPA_PARQUE_KEYS.NOMEREDE) || null,
    VERTICAL_MP: pick(row, MAPA_PARQUE_KEYS.VERTICAL) || null,
    DATA_FIM_VTECH: toDate(row, MAPA_PARQUE_KEYS.DATA_FIM_VTECH),
    FLG_TROCA_VTECH: pick(row, MAPA_PARQUE_KEYS.FLG_TROCA_VTECH) || null,
    razaoSocial: razaoSocial || null,
    cnpj: cnpj || null,
    telefone: p1,
    telefone1: p1,
    telefone2: p2,
    telefone3: p3,
    cidade: pick(row, MAPA_PARQUE_KEYS.DS_CIDADE) || null,
    vertical: pick(row, MAPA_PARQUE_KEYS.VERTICAL) || null,
    raw: row,
    emails: [],
    previousConsultants: [],
  };
}

function toInt(row: NormalizedRow, keys: string[]) {
  const v = pick(row, keys);
  if (!v) return null;
  const n = parseInt(v.replace(/\D/g, ""), 10);
  if (Number.isNaN(n)) return null;
  const MAX_INT = 2147483647;
  if (n > MAX_INT) return null;
  return n;
}

function toDate(row: NormalizedRow, keys: string[]) {
  const v = pick(row, keys);
  if (!v) return null;
  // Excel serial date handling (e.g., 44772)
  const asNumber = Number(v);
  if (!Number.isNaN(asNumber) && asNumber > 1000 && asNumber < 60000) {
    const excelEpoch = Date.UTC(1899, 11, 30); // Excel epoch
    const millis = excelEpoch + asNumber * 24 * 60 * 60 * 1000;
    const dSerial = new Date(millis);
    const y = dSerial.getUTCFullYear();
    if (y >= 1900 && y <= 2100) return dSerial;
  }

  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  const year = d.getFullYear();
  if (year < 1900 || year > 2100) return null;
  return d;
}
