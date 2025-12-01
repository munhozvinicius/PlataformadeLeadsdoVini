import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { connectToDatabase } from "@/lib/mongodb";
import { getSessionUser } from "@/lib/auth-helpers";
import Company from "@/models/Company";
import mongoose from "mongoose";

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
  await connectToDatabase();
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

    const existing = await Company.findOne({ documento, campaign: campaignId });
    if (existing) {
      existing.empresa = empresa;
      existing.vertical = vertical;
      existing.telefone1 = telefone1;
      existing.telefone2 = telefone2;
      existing.telefone3 = telefone3;
      existing.cidade = cidade;
      existing.uf = uf;
      existing.assignedTo = new mongoose.Types.ObjectId(assignedToUserId);
      existing.raw = normalized;
      await existing.save();
      updated += 1;
    } else {
      await Company.create({
        empresa,
        documento,
        vertical,
        telefone1,
        telefone2,
        telefone3,
        cidade,
        uf,
        raw: normalized,
        campaign: campaignId,
        assignedTo: new mongoose.Types.ObjectId(assignedToUserId),
        stage: "PROSPECCAO",
        isWorked: false,
      });
      created += 1;
    }
  }

  return NextResponse.json({ created, updated, total: created + updated });
}
