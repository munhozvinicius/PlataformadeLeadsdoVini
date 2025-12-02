export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import * as XLSX from "xlsx";
import { unzipSync } from "fflate";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role, LeadStatus } from "@prisma/client";

function normalizeRow(row: Record<string, unknown>) {
  const norm: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    norm[k.trim().toUpperCase()] = typeof v === "string" ? v.trim() : v;
  }
  return norm;
}

function s(value: unknown) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role === Role.CONSULTOR) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const compressedFlag = formData.get("compressed") as string | null;
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
    const razaoSocial = s(norm["RAZAO_SOCIAL"] || norm["EMPRESA"]);
    const nomeFantasia = s(norm["NOME_FANTASIA"]);
    const vertical = s(norm["VERTICAL"]);
    const cidade = s(norm["CIDADE"]);
    const estado = s(norm["ESTADO"] || norm["UF"]);
    const telefone = s(norm["TELEFONE"]) || s(norm["TELEFONE1"]);
    const cnpj = s(norm["CNPJ"]);
    const email = s(norm["EMAIL"]);

    await prisma.lead.create({
      data: {
        campanhaId: campanhaIdToUse!,
        razaoSocial,
        nomeFantasia,
        vertical,
        cidade,
        estado,
        telefone,
        cnpj,
        email,
        status: LeadStatus.NOVO,
        historico: [],
      },
    });
    created += 1;
  }

  return NextResponse.json({ created, campanhaId: campanhaIdToUse }, { status: 201 });
}
