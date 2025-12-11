export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import * as XLSX from "xlsx";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CampaignType, LeadStatus, Office, Prisma } from "@prisma/client";

function parseCampaignType(value: unknown): CampaignType | null {
  const raw = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!raw) return null;
  return raw === CampaignType.MAPA_PARQUE || raw === CampaignType.COCKPIT ? (raw as CampaignType) : null;
}

function parseOffice(value: unknown): Office | null {
  const raw = typeof value === "string" ? value.trim().toUpperCase() : "";
  const offices = Object.values(Office) as string[];
  return offices.includes(raw) ? (raw as Office) : null;
}

function normalizeRow(row: Record<string, unknown>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    const normalizedKey = key.trim().toUpperCase();
    normalized[normalizedKey] = value === undefined || value === null ? "" : String(value).trim();
  }
  return normalized;
}

function getField(row: Record<string, string>, keys: string[]): string {
  for (const key of keys) {
    const val = row[key];
    if (val && val.trim().length > 0) return val.trim();
  }
  return "";
}

function isRowEmpty(row: Record<string, string>) {
  return Object.values(row).every((value) => !value || value.trim().length === 0);
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ message: "Não autorizado. Faça login novamente." }, { status: 401 });
    }

    const formData = await req.formData();
    const nome = (formData.get("nome") as string | null)?.toString().trim() ?? "";
    const descricao = (formData.get("descricao") as string | null)?.toString().trim() ?? "";
    const campaignTypeRaw = (formData.get("campaignType") as string | null)?.toString().trim() ?? "";
    const officeRaw = (formData.get("office") as string | null)?.toString().trim() ?? "";
    const file = formData.get("file");

    if (!nome || !campaignTypeRaw || !officeRaw || !(file instanceof File)) {
      return NextResponse.json(
        { message: "Informe nome, tipo de campanha, escritório e anexe o arquivo (.xlsx ou .csv)." },
        { status: 400 },
      );
    }

    const campaignType = parseCampaignType(campaignTypeRaw);
    const office = parseOffice(officeRaw);
    if (!campaignType) {
      return NextResponse.json({ message: "Tipo de campanha inválido." }, { status: 400 });
    }
    if (!office) {
      return NextResponse.json({ message: "Escritório inválido." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      return NextResponse.json({ message: "Arquivo sem planilhas." }, { status: 400 });
    }
    const sheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" }) as Record<string, unknown>[];

    const campanha = await prisma.campanha.create({
      data: {
        nome,
        descricao: descricao || null,
        type: campaignType,
        tipo: campaignType,
        office,
        createdById: session.user.id ?? undefined,
      },
    });

    const leadsToInsert: Prisma.LeadCreateManyInput[] = [];
    rows.map(normalizeRow).forEach((row) => {
      if (isRowEmpty(row)) return;

      const razaoSocial = getField(row, ["RAZAO_SOCIAL", "RAZAO SOCIAL"]);
      const cnpj = getField(row, ["CNPJ"]);
      const telefone = getField(row, ["TELEFONE", "TELEFONE1", "TELEFONE 1"]);
      const cidade = getField(row, ["CIDADE"]);

      if (!razaoSocial && !cnpj && !telefone && !cidade) return;

      leadsToInsert.push({
        campanhaId: campanha.id,
        type: campaignType,
        status: LeadStatus.NOVO,
        razaoSocial: razaoSocial || null,
        cnpj: cnpj || null,
        telefone: telefone || null,
        telefone1: telefone || null,
        cidade: cidade || null,
        escritorio: office,
        emails: [],
        isWorked: false,
      });
    });

    const createResult = leadsToInsert.length
      ? await prisma.lead.createMany({ data: leadsToInsert })
      : { count: 0 };

    return NextResponse.json(
      { message: "Campanha criada com sucesso.", campanha, totalLeads: createResult.count },
      { status: 201 },
    );
  } catch (error) {
    console.error("[API /campanhas/v2] Erro ao criar campanha", error);
    return NextResponse.json(
      { message: "Erro interno ao criar campanha." },
      { status: 500 },
    );
  }
}
