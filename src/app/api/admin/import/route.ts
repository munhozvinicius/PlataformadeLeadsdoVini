export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
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

  // Prevent very large uploads
  const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
  if (buffer.length > MAX_BYTES) {
    return NextResponse.json({ message: "File too large" }, { status: 413 });
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch (err) {
    return NextResponse.json({ message: "Failed to parse spreadsheet" }, { status: 400 });
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    return NextResponse.json({ message: "No sheets found in file" }, { status: 400 });
  }

  // Read header row and normalize header names
  const headerRow = worksheet.getRow(1).values as Array<unknown>;
  // headerRow[0] is usually undefined in exceljs
  const headers: string[] = [];
  for (let i = 1; i < headerRow.length; i++) {
    const h = headerRow[i];
    if (h === undefined || h === null) {
      headers.push(`COLUMN_${i}`);
    } else {
      headers.push(String(h).trim());
    }
  }

  const rows: Record<string, unknown>[] = [];
  for (let r = 2; r <= worksheet.rowCount; r++) {
    const row = worksheet.getRow(r);
    // skip entirely empty rows
    const isEmpty = row.values.every((v) => v === null || v === undefined || v === "");
    if (isEmpty) continue;
    const obj: Record<string, unknown> = {};
    for (let c = 0; c < headers.length; c++) {
      const cell = row.getCell(c + 1).value;
      obj[headers[c] ?? `COLUMN_${c + 1}`] = cell === null || cell === undefined ? "" : cell;
    }
    rows.push(obj);
  }

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
