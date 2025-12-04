export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import * as XLSX from "xlsx";
import { unzipSync } from "fflate";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role, LeadStatus } from "@prisma/client";

function stringOrEmpty(value: unknown) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function normalizeKey(key: string) {
  return key
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeRow(row: Record<string, unknown>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    normalized[normalizeKey(key)] = stringOrEmpty(value);
  }
  return normalized;
}

function firstNonEmpty(...values: (string | undefined)[]) {
  return values.find((value) => value && value.length > 0) ?? "";
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role === Role.CONSULTOR) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const compressedFlag = formData.get("compressed") as string | null;
  const consultorId = formData.get("consultorId") as string | null;
  const assignmentType = (formData.get("assignmentType") as string | null) ?? "single";
  const multiConsultants = formData.getAll("multiConsultants[]").filter(Boolean) as string[];
  const campanhaId = formData.get("campanhaId") as string | null;
  const campanhaNome = formData.get("campanhaNome") as string | null;
  const originalFileName = file?.name ?? "arquivo.xlsx";

  if (!file) {
    return NextResponse.json({ message: "Arquivo não enviado" }, { status: 400 });
  }

  let campanhaIdToUse = campanhaId;
  if (!campanhaIdToUse) {
    if (!campanhaNome) {
      return NextResponse.json({ message: "Campanha ausente" }, { status: 400 });
    }
    const created = await prisma.campanha.create({
      data: { nome: campanhaNome, descricao: campanhaNome, createdById: session.user.id },
    });
    campanhaIdToUse = created.id;
  }

  let buffer = Buffer.from(await file.arrayBuffer());
  if (compressedFlag === "true") {
    try {
      const unzipped = unzipSync(new Uint8Array(buffer));
      const firstEntry = Object.values(unzipped)[0];
      if (!firstEntry) {
        return NextResponse.json({ message: "Arquivo compactado inválido" }, { status: 400 });
      }
      buffer = Buffer.from(firstEntry);
    } catch {
      return NextResponse.json({ message: "Não foi possível descompactar o arquivo" }, { status: 400 });
    }
  }
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" }) as Record<string, unknown>[];

  let created = 0;
  let duplicatedLeads = 0;
  let attributedLeads = 0;
  let notAttributedLeads = 0;

  const offices = await prisma.officeRecord.findMany({
    select: { id: true, office: true, code: true, name: true },
  });
  const officeLookup = new Map<string, string>();
  const normalizeOfficeKey = (value?: string) => (value ? value.trim().toUpperCase() : "");
  offices.forEach((office) => {
    const codeKey = normalizeOfficeKey(office.office ?? office.code);
    const nameKey = normalizeOfficeKey(office.name);
    if (codeKey) officeLookup.set(codeKey, office.id);
    if (nameKey) officeLookup.set(nameKey, office.id);
  });

  const resolveOfficeId = (territory?: string) => {
    const normalized = normalizeOfficeKey(territory);
    if (!normalized) return null;
    const direct = officeLookup.get(normalized);
    if (direct) return direct;
    for (const [key, id] of officeLookup.entries()) {
      if (normalized.includes(key) || key.includes(normalized)) {
        return id;
      }
    }
    return null;
  };

  const importBatch = await prisma.importBatch.create({
    data: {
      nomeArquivoOriginal: originalFileName,
      fileName: originalFileName,
      campaignId: campanhaIdToUse!,
      totalLeads: rows.length,
      criadoPorId: session.user.id,
    },
  });
  for (const row of rows) {
    const norm = normalizeRow(row);
    const razaoSocial = firstNonEmpty(norm["RAZAO_SOCIAL"], norm["EMPRESA"], norm["NOME_FANTASIA"]);
    const nomeFantasia = firstNonEmpty(norm["NOME_FANTASIA"], norm["EMPRESA"], norm["RAZAO_SOCIAL"]);
    const cidade = norm["CIDADE"];
    const estado = firstNonEmpty(norm["ESTADO"], norm["UF"]);
    const telefone1 = norm["TELEFONE1"] || norm["TELEFONE"];
    const telefone2 = norm["TELEFONE2"];
    const telefone3 = norm["TELEFONE3"];
    const telefone = firstNonEmpty(telefone1, telefone2, telefone3, norm["TELEFONE"]);
    const cnpj = firstNonEmpty(norm["CNPJ"], norm["DOCUMENTO"]);
    const email = norm["EMAIL"];
    const enderecoBairro = norm["BAIRRO"];
    const vertical = norm["VERTICAL"];
    const logradouro = norm["LOGRADOURO"];
    const numero = norm["NUMERO"];
    const cep = norm["CEP"];
    const endereco = logradouro ? `${logradouro}${numero ? `, ${numero}` : ""}` : "";
    const territorio = norm["TERRITORIO"];
    const ofertaMkt = firstNonEmpty(norm["OFERTA MKT"], norm["OFERTA_MKT"], norm["OFERTA"]);
    const estrategia = norm["ESTRATEGIA"];
    const armario = norm["ARMARIO"];
    const idPruma = norm["ID PRUMA"];
    const vlFatPresumido = firstNonEmpty(norm["VL_FAT_PRESUMIDO"], norm["VL FAT PRESUMIDO"]);
    const cnae = firstNonEmpty(norm["CD_CNAE"], norm["CNAE"]);
    const origem = norm["ORIGEM"] || campanhaNome || "Importação";
    const telefones = [
      telefone1 ? { rotulo: "Telefone 1", valor: telefone1 } : null,
      telefone2 ? { rotulo: "Telefone 2", valor: telefone2 } : null,
      telefone3 ? { rotulo: "Telefone 3", valor: telefone3 } : null,
    ].filter(Boolean) as { rotulo: string; valor: string }[];
    const site = norm["SITE"];

    // Evitar duplicados por documento + campanha
    if (cnpj) {
      const exists = await prisma.lead.findFirst({ where: { campanhaId: campanhaIdToUse!, documento: cnpj } });
      if (exists) {
        duplicatedLeads += 1;
        continue;
      }
    }

    let consultorEscolhido: string | undefined = undefined;
    if (assignmentType === "single") {
      consultorEscolhido = consultorId || undefined;
    } else if (assignmentType === "multi" && multiConsultants.length > 0) {
      const index = created % multiConsultants.length;
      consultorEscolhido = multiConsultants[index];
    } else {
      consultorEscolhido = undefined;
    }

    await prisma.lead.create({
      data: {
        campanhaId: campanhaIdToUse!,
        importBatchId: importBatch.id,
        razaoSocial,
        nomeFantasia,
        vertical,
        cidade,
        estado,
        telefone,
        telefone1: telefone1 || undefined,
        telefone2: telefone2 || undefined,
        telefone3: telefone3 || undefined,
        cnpj,
        documento: cnpj || undefined,
        email,
        logradouro: logradouro || undefined,
        numero: numero || undefined,
        bairro: enderecoBairro || undefined,
        cep: cep || undefined,
        endereco: endereco || undefined,
        territorio: territorio || undefined,
        ofertaMkt: ofertaMkt || undefined,
        estrategia: estrategia || undefined,
        armario: armario || undefined,
        idPruma: idPruma || undefined,
        vlFatPresumido: vlFatPresumido || undefined,
        cnae: cnae || undefined,
        raw: norm,
        // quando não atribuir, grava explicitamente null para que filtros de estoque encontrem
        consultorId: assignmentType === "none" ? null : consultorEscolhido ?? null,
        status: LeadStatus.NOVO,
        historico: [],
        isWorked: false,
        telefones,
        emails: email ? [email] : [],
        origem: origem || undefined,
        site: site || undefined,
        officeId: resolveOfficeId(territorio) ?? undefined,
      },
    });
    created += 1;
    if (assignmentType === "none" || !consultorEscolhido) {
      notAttributedLeads += 1;
    } else {
      attributedLeads += 1;
    }
  }

  await prisma.importBatch.update({
    where: { id: importBatch.id },
    data: {
      importedLeads: created,
      duplicatedLeads,
      attributedLeads,
      notAttributedLeads,
    },
  });

  return NextResponse.json(
    {
      campaignId: campanhaIdToUse,
      importBatchId: importBatch.id,
      fileName: originalFileName,
      totalLeads: rows.length,
      importedLeads: created,
      duplicatedLeads,
      attributedLeads,
      notAttributedLeads,
    },
    { status: 201 }
  );
}
