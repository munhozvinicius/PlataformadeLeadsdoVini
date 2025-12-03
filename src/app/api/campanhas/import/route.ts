export const dynamic = "force-dynamic";

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
  const campanhaId = formData.get("campanhaId") as string | null;
  const campanhaNome = formData.get("campanhaNome") as string | null;

  let campanhaIdToUse = campanhaId;
  if (!campanhaIdToUse) {
    if (!campanhaNome) {
      return NextResponse.json({ message: "Campanha ausente" }, { status: 400 });
    }
    const created = await prisma.campanha.create({ data: { nome: campanhaNome } });
    campanhaIdToUse = created.id;
  }

  if (!file) {
    return NextResponse.json({ message: "Arquivo não enviado" }, { status: 400 });
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

    await prisma.lead.create({
      data: {
        campanhaId: campanhaIdToUse!,
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
        email,
        logradouro: logradouro || undefined,
        numero: numero || undefined,
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
        consultorId: consultorId || undefined,
        status: LeadStatus.NOVO,
        historico: [],
        isWorked: false,
      },
    });
    created += 1;
  }

  return NextResponse.json({ created, campanhaId: campanhaIdToUse }, { status: 201 });
}
