export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CampaignType, LeadStatus, Prisma, Role } from "@prisma/client";
import * as XLSX from "xlsx";

const ALLOWED_ROLES_FOR_UPLOAD: Role[] = [
  Role.MASTER,
  Role.GERENTE_SENIOR,
  Role.GERENTE_NEGOCIOS,
  Role.PROPRIETARIO,
];

const COCKPIT_HEADERS = [
  "UF",
  "CIDADE",
  "DOCUMENTO",
  "EMPRESA",
  "CD_CNAE",
  "VL_FAT_PRESUMIDO",
  "TELEFONE2",
  "TELEFONE1",
  "TELEFONE3",
  "LOGRADOURO",
  "TERRITORIO",
  "OFERTA MKT",
  "CEP",
  "NUMERO",
  "ESTRATEGIA",
  "ARMARIO",
  "ID PRUMA",
  "VERTICAL",
];

const MAPA_PARQUE_HEADERS = [
  "NR_CNPJ",
  "NM_CLIENTE",
  "TP_PRODUTO",
  "QT_MOVEL_TERM",
  "QT_MOVEL_PEN",
  "QT_MOVEL_M2M",
  "QT_BASICA_TERM_FIBRA",
  "QT_BASICA_TERM_METALICO",
  "QT_BASICA_BL",
  "QT_BL_FTTH",
  "QT_BL_FTTC",
  "QT_BASICA_TV",
  "QT_BASICA_OUTROS",
  "QT_BASICA_LINAS",
  "QT_AVANCADA_DADOS",
  "AVANCADA_VOZ",
  "QT_VIVO_TECH",
  "QT_VVN",
  "DS_ENDERECO",
  "DS_CIDADE",
  "NR_CEP",
  "NUMERO",
  "NM_CONTATO_SFA",
  "EMAIL_CONTATO_PRINCIPAL_SFA",
  "CELULAR_CONTATO_PRINCIPAL_SFA",
  "TLFN_1",
  "TLFN_2",
  "TLFN_3",
  "TLFN_4",
  "TLFN_5",
  "TEL_COMERCIAL_SIEBEL",
  "TEL_CELULAR_SIEBEL",
  "TEL_RESIDENCIAL_SIEBEL",
  "NOMEREDE",
  "VERTICAL",
  "DATA_FIM_VTECH",
  "FLG_TROCA_VTECH",
];

function normalizeKey(key: string) {
  return key
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function stringOrEmpty(value: unknown) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function normalizeRow(row: Record<string, unknown>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    normalized[normalizeKey(key)] = stringOrEmpty(value);
  }
  return normalized;
}

function hasRequiredHeaders(columnNames: Set<string>, required: string[]) {
  return required.every((header) => columnNames.has(normalizeKey(header)));
}

function parseNumber(value?: string) {
  if (!value) return undefined;
  const cleaned = value.replace(/\./g, "").replace(",", ".");
  const parsed = Number(cleaned);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function parseInteger(value?: string) {
  if (!value) return undefined;
  const parsed = parseInt(value.replace(/\D/g, ""), 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function parseDate(value?: string) {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed;
}

function buildCockpitLead(
  norm: Record<string, string>,
  campanhaId: string,
  batchId: string,
): Prisma.LeadCreateManyInput {
  const telefoneValues = [norm["TELEFONE1"], norm["TELEFONE2"], norm["TELEFONE3"]].filter(Boolean);
  const emails = [norm["EMAIL"], norm["EMAIL_CONTATO_PRINCIPAL_SFA"]].filter(Boolean);
  return {
    campanhaId,
    importBatchId: batchId,
    type: CampaignType.COCKPIT,
    status: LeadStatus.NOVO,
    isWorked: false,
    UF: norm["UF"] || undefined,
    CIDADE: norm["CIDADE"] || undefined,
    DOCUMENTO: norm["DOCUMENTO"] || undefined,
    EMPRESA: norm["EMPRESA"] || undefined,
    CD_CNAE: norm["CD_CNAE"] || norm["CNAE"] || undefined,
    VL_FAT_PRESUMIDO: parseNumber(norm["VL_FAT_PRESUMIDO"] || norm["VL FAT PRESUMIDO"]),
    TELEFONE1: norm["TELEFONE1"] || undefined,
    TELEFONE2: norm["TELEFONE2"] || undefined,
    TELEFONE3: norm["TELEFONE3"] || undefined,
    LOGRADOURO: norm["LOGRADOURO"] || undefined,
    NUMERO: norm["NUMERO"] || undefined,
    CEP: norm["CEP"] || norm["NR_CEP"] || undefined,
    TERRITORIO: norm["TERRITORIO"] || undefined,
    OFERTA_MKT: norm["OFERTA MKT"] || norm["OFERTA_MKT"] || undefined,
    ESTRATEGIA: norm["ESTRATEGIA"] || undefined,
    ARMARIO: norm["ARMARIO"] || undefined,
    ID_PRUMA: norm["ID PRUMA"] || undefined,
    VERTICAL_COCKPIT: norm["VERTICAL"] || undefined,
    razaoSocial: norm["RAZAO_SOCIAL"] || norm["EMPRESA"] || undefined,
    nomeFantasia: norm["NOME_FANTASIA"] || norm["EMPRESA"] || undefined,
    cidade: norm["CIDADE"] || undefined,
    estado: norm["ESTADO"] || norm["UF"] || undefined,
    telefone: telefoneValues[0] || undefined,
    telefone1: telefoneValues[0] || undefined,
    telefone2: telefoneValues[1] || undefined,
    telefone3: telefoneValues[2] || undefined,
    email: emails[0] || undefined,
    emails: emails.length > 0 ? emails : [],
    raw: norm as Prisma.InputJsonValue,
    telefones: telefoneValues.length > 0 ? telefoneValues : undefined,
  };
}

function buildMapaParqueLead(
  norm: Record<string, string>,
  campanhaId: string,
  batchId: string,
): Prisma.LeadCreateManyInput {
  const telefoneValues = [
    norm["TLFN_1"],
    norm["TLFN_2"],
    norm["TLFN_3"],
    norm["TLFN_4"],
    norm["TLFN_5"],
    norm["TEL_CELULAR_SIEBEL"],
    norm["TEL_COMERCIAL_SIEBEL"],
    norm["TEL_RESIDENCIAL_SIEBEL"],
  ].filter(Boolean);
  const emails = [norm["EMAIL_CONTATO_PRINCIPAL_SFA"]].filter(Boolean);
  const contatoPrincipal =
    norm["NM_CONTATO_SFA"] || norm["EMAIL_CONTATO_PRINCIPAL_SFA"] || norm["CELULAR_CONTATO_PRINCIPAL_SFA"]
      ? {
          nome: norm["NM_CONTATO_SFA"] || undefined,
          email: norm["EMAIL_CONTATO_PRINCIPAL_SFA"] || undefined,
          telefone: norm["CELULAR_CONTATO_PRINCIPAL_SFA"] || undefined,
        }
      : undefined;

  return {
    campanhaId,
    importBatchId: batchId,
    type: CampaignType.MAPA_PARQUE,
    status: LeadStatus.NOVO,
    isWorked: false,
    NR_CNPJ: norm["NR_CNPJ"] || undefined,
    NM_CLIENTE: norm["NM_CLIENTE"] || undefined,
    TP_PRODUTO: norm["TP_PRODUTO"] || undefined,
    QT_MOVEL_TERM: parseInteger(norm["QT_MOVEL_TERM"]),
    QT_MOVEL_PEN: parseInteger(norm["QT_MOVEL_PEN"]),
    QT_MOVEL_M2M: parseInteger(norm["QT_MOVEL_M2M"]),
    QT_BASICA_TERM_FIBRA: parseInteger(norm["QT_BASICA_TERM_FIBRA"]),
    QT_BASICA_TERM_METALICO: parseInteger(norm["QT_BASICA_TERM_METALICO"]),
    QT_BASICA_BL: parseInteger(norm["QT_BASICA_BL"]),
    QT_BL_FTTH: parseInteger(norm["QT_BL_FTTH"]),
    QT_BL_FTTC: parseInteger(norm["QT_BL_FTTC"]),
    QT_BASICA_TV: parseInteger(norm["QT_BASICA_TV"]),
    QT_BASICA_OUTROS: parseInteger(norm["QT_BASICA_OUTROS"]),
    QT_BASICA_LINAS: parseInteger(norm["QT_BASICA_LINAS"]),
    QT_AVANCADA_DADOS: parseInteger(norm["QT_AVANCADA_DADOS"]),
    AVANCADA_VOZ: parseInteger(norm["AVANCADA_VOZ"]),
    QT_VIVO_TECH: parseInteger(norm["QT_VIVO_TECH"]),
    QT_VVN: parseInteger(norm["QT_VVN"]),
    DS_ENDERECO: norm["DS_ENDERECO"] || undefined,
    DS_CIDADE: norm["DS_CIDADE"] || undefined,
    NR_CEP: norm["NR_CEP"] || undefined,
    NUMERO_MP: norm["NUMERO"] || undefined,
    NM_CONTATO_SFA: norm["NM_CONTATO_SFA"] || undefined,
    EMAIL_CONTATO_PRINCIPAL_SFA: norm["EMAIL_CONTATO_PRINCIPAL_SFA"] || undefined,
    CELULAR_CONTATO_PRINCIPAL_SFA: norm["CELULAR_CONTATO_PRINCIPAL_SFA"] || undefined,
    NOMEREDE: norm["NOMEREDE"] || undefined,
    VERTICAL_MP: norm["VERTICAL"] || undefined,
    DATA_FIM_VTECH: parseDate(norm["DATA_FIM_VTECH"]),
    FLG_TROCA_VTECH: norm["FLG_TROCA_VTECH"] || undefined,
    razaoSocial: norm["NM_CLIENTE"] || undefined,
    nomeFantasia: norm["NM_CLIENTE"] || undefined,
    cidade: norm["DS_CIDADE"] || undefined,
    estado: undefined,
    telefone: telefoneValues[0] || undefined,
    email: emails[0] || undefined,
    emails: emails.length > 0 ? emails : [],
    contatoPrincipal,
    telefones: telefoneValues.length > 0 ? telefoneValues : undefined,
    raw: norm as Prisma.InputJsonValue,
  };
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ message: "Unauthorized (no session)" }, { status: 401 });
    }

    if (!ALLOWED_ROLES_FOR_UPLOAD.includes(session.user.role as Role)) {
      return NextResponse.json({ message: "Sem permissão para processar bases." }, { status: 403 });
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, role: true, office: true },
    });

    if (!currentUser) {
      return NextResponse.json({ message: "Usuário não encontrado." }, { status: 404 });
    }

    const campanha = await prisma.campanha.findUnique({
      where: { id: params.id },
    });

    if (!campanha) {
      return NextResponse.json({ message: "Campanha não encontrada." }, { status: 404 });
    }

    const restrictedRole = [Role.GERENTE_NEGOCIOS, Role.PROPRIETARIO];
    if (restrictedRole.includes(currentUser.role)) {
      const isCreator = campanha.createdById === currentUser.id;
      const isSameOffice = campanha.office === currentUser.office;
      if (!isCreator && !isSameOffice) {
        return NextResponse.json({
          message: "Você só pode processar bases nas campanhas do seu escritório.",
        }, { status: 403 });
      }
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ message: "Arquivo não fornecido." }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "" }) as Record<string, unknown>[];

    if (!rows.length) {
      return NextResponse.json({ message: "Arquivo vazio." }, { status: 400 });
    }

    const headerNames = new Set(Object.keys(rows[0]).map((key) => normalizeKey(key)));
    const requiredHeaders =
      campanha.type === CampaignType.COCKPIT ? COCKPIT_HEADERS : MAPA_PARQUE_HEADERS;

    if (!hasRequiredHeaders(headerNames, requiredHeaders)) {
      return NextResponse.json(
        {
          message: `O arquivo não possui o layout esperado para ${campanha.type === CampaignType.COCKPIT ? "Cockpit" : "Mapa Parque"}.`,
        },
        { status: 400 },
      );
    }

    const batch = await prisma.importBatch.create({
      data: {
        nomeArquivoOriginal: file.name,
        campaignId: campanha.id,
        totalLeads: rows.length,
        importedLeads: 0,
        status: "processing",
        criadoPorId: currentUser.id,
      },
    });

    const leads: Prisma.LeadCreateManyInput[] = rows
      .map((row) => {
        const normalized = normalizeRow(row);
        if (campanha.type === CampaignType.COCKPIT) {
          if (!normalized["DOCUMENTO"] && !normalized["EMPRESA"]) {
            return null;
          }
          return buildCockpitLead(normalized, campanha.id, batch.id);
        }
        if (!normalized["NR_CNPJ"] && !normalized["NM_CLIENTE"]) {
          return null;
        }
        return buildMapaParqueLead(normalized, campanha.id, batch.id);
      })
      .filter(Boolean) as Prisma.LeadCreateManyInput[];

    if (leads.length === 0) {
      await prisma.importBatch.update({
        where: { id: batch.id },
        data: { status: "failed", errorMessage: "Nenhum lead válido encontrado." },
      });
      return NextResponse.json({ message: "Nenhuma linha válida encontrada." }, { status: 400 });
    }

    await prisma.lead.createMany({
      data: leads,
    });

    await prisma.importBatch.update({
      where: { id: batch.id },
      data: {
        importedLeads: leads.length,
        status: "completed",
      },
    });

    await prisma.campanha.update({
      where: { id: campanha.id },
      data: {
        totalLeads: { increment: leads.length },
        remainingLeads: { increment: leads.length },
      },
    });

    return NextResponse.json({
      campaignId: campanha.id,
      importedLeads: leads.length,
    });
  } catch (error) {
    console.error("Erro ao processar base da campanha:", error);
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}
