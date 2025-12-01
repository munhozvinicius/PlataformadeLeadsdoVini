export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import * as XLSX from "xlsx";
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

  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" }) as Record<string, unknown>[];

  let created = 0;
  for (const row of rows) {
    const norm = normalizeRow(row);
    const empresa = s(norm["EMPRESA"] || norm["RAZAO_SOCIAL"] || norm["NOME_FANTASIA"]);
    const cidade = s(norm["CIDADE"]);
    const telefone = s(norm["TELEFONE"]) || s(norm["TELEFONE1"]);
    const cnpj = s(norm["CNPJ"]);

    await prisma.lead.create({
      data: {
        campanhaId: campanhaIdToUse!,
        empresa,
        cidade,
        telefone,
        cnpj,
        status: LeadStatus.NOVO,
        historico: [],
      },
    });
    created += 1;
  }

  return NextResponse.json({ created, campanhaId: campanhaIdToUse }, { status: 201 });
}
