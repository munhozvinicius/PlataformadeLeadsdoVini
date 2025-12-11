export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-helpers";
import { LeadStatus, Prisma } from "@prisma/client";

type NormalizedRow = Record<string, unknown>;

function normalizeRow(row: Record<string, unknown>): NormalizedRow {
  const normalized: NormalizedRow = {};
  for (const [key, value] of Object.entries(row)) {
    const cleanKey = key.trim().toUpperCase();
    normalized[cleanKey] = value;
  }
  return normalized;
}

function stringOrEmpty(value: unknown) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

export async function POST(req: Request) {
  const sessionUser = await getSessionUser();
  if (!sessionUser || sessionUser.role !== "MASTER") {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const campaignId = formData.get("campaignId") as string | null;
  const assignedToUserId = formData.get("assignedToUserId") as string | null;

  if (!file || !campaignId || !assignedToUserId) {
    return NextResponse.json({ message: "Missing file or fields" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" }) as Record<string, unknown>[];

  let created = 0;
  let updated = 0;

  for (const row of rows) {
    const normalized = normalizeRow(row);
    const documento = stringOrEmpty(normalized["DOCUMENTO"]);
    if (!documento) continue;

    const empresa =
      stringOrEmpty(normalized["EMPRESA"]) ||
      stringOrEmpty(normalized["EMPRESA_RAZAO"]) ||
      "Sem nome";
    const vertical = stringOrEmpty(normalized["VERTICAL"]) || "Sem vertical";
    const telefone1 = stringOrEmpty(normalized["TELEFONE1"]);
    const telefone2 = stringOrEmpty(normalized["TELEFONE2"]);
    const telefone3 = stringOrEmpty(normalized["TELEFONE3"]);
    const cidade = stringOrEmpty(normalized["CIDADE"]);
    const uf = stringOrEmpty(normalized["UF"]);

    // Check existing by documento AND campaign
    const existing = await prisma.lead.findFirst({
      where: {
        documento,
        campanhaId: campaignId,
      },
    });

    if (existing) {
      await prisma.lead.update({
        where: { id: existing.id },
        data: {
          EMPRESA: empresa, // Mapped to EMPRESA as empresa doesn't exist in schema
          razaoSocial: empresa, // Also map to razaoSocial for fallback?
          vertical,
          telefone1,
          telefone2,
          telefone3,
          cidade,
          estado: uf, // mapping uf to estado if that's the intention
          consultorId: assignedToUserId, // renamed field
          raw: normalized as Prisma.InputJsonValue, // Prisma Json type
        },
      });
      updated += 1;
    } else {
      await prisma.lead.create({
        data: {
          EMPRESA: empresa,
          razaoSocial: empresa,
          documento,
          vertical,
          telefone1,
          telefone2,
          telefone3,
          cidade,
          estado: uf,
          raw: normalized as Prisma.InputJsonValue,
          campanhaId: campaignId,
          consultorId: assignedToUserId,
          status: LeadStatus.NOVO,
          isWorked: false,

          // COCKPIT fields populated above mapped from normalized input
        },
      });
      created += 1;
    }
  }

  return NextResponse.json({ created, updated, total: created + updated });
}
