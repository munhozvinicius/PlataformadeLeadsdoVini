import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role, CampaignType, Office, LeadStatus } from "@prisma/client";
import * as XLSX from "xlsx";

function stringOrEmpty(value: unknown) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function parseCampaignType(value: unknown): CampaignType | null {
  if (!value) return null;
  const raw = String(value).trim().toUpperCase();
  if (raw === "MAPA_PARQUE") return CampaignType.MAPA_PARQUE;
  if (raw === "COCKPIT") return CampaignType.COCKPIT;
  return null;
}

function parseOffice(value: unknown): Office | null {
  if (!value) return null;
  const raw = String(value).trim().toUpperCase();
  // Safe way to check enum values
  const valid = Object.values(Office).includes(raw as Office);
  return valid ? (raw as Office) : null;
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !session.user.id) {
      return NextResponse.json({ message: "Não autenticado." }, { status: 401 });
    }

    // Role check: Only Master, GS, GN, Owner (Consultant already blocked by middleware usually, but checking here too)
    const role = session.user.role;
    if (role === Role.CONSULTOR) {
      return NextResponse.json({ message: "Sem permissão." }, { status: 403 });
    }

    const formData = await req.formData();
    const nome = formData.get("nome")?.toString().trim();
    const descricao = formData.get("descricao")?.toString().trim();
    const typeRaw = formData.get("campaignType");
    const officeRaw = formData.get("office");
    const file = formData.get("file") as File | null;

    const campaignType = parseCampaignType(typeRaw);
    const office = parseOffice(officeRaw);

    if (!nome || !campaignType || !office) {
      return NextResponse.json({ message: "Campos obrigatórios: Nome, Tipo, Escritório." }, { status: 400 });
    }

    // Create Campaign
    const campanha = await prisma.campanha.create({
      data: {
        nome,
        descricao,
        tipo: campaignType,
        type: campaignType,
        office,
        createdById: session.user.id,
      },
    });

    let totalLeads = 0;

    // Process File if present
    if (file) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const firstSheet = workbook.SheetNames[0];
      const sheet = workbook.Sheets[firstSheet];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" }) as Record<string, unknown>[];

      const leadsData = [];

      for (const row of rows) {
        // Simple normalization
        const normalized: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(row)) {
          normalized[k.trim().toUpperCase()] = v;
        }

        const documento = stringOrEmpty(normalized["DOCUMENTO"] || normalized["CNPJ"] || normalized["CPF"]);
        // If no document, skip or generate? Let's skip empty docs to avoid mess
        if (!documento && campaignType === CampaignType.COCKPIT) continue;

        const empresa = stringOrEmpty(normalized["EMPRESA"] || normalized["RAZAO_SOCIAL"] || normalized["NOME"] || "Sem Nome");

        // Prepare Lead Object
        // We map common fields. 'raw' stores everything.
        leadsData.push({
          campanhaId: campanha.id,
          documento: documento || "N/A", // Fallback
          EMPRESA: empresa,
          razaoSocial: stringOrEmpty(normalized["RAZAO_SOCIAL"]),
          nomeFantasia: stringOrEmpty(normalized["NOME_FANTASIA"]),
          cidade: stringOrEmpty(normalized["CIDADE"]),
          estado: stringOrEmpty(normalized["ESTADO"] || normalized["UF"]),
          telefone1: stringOrEmpty(normalized["TELEFONE1"] || normalized["TEL1"] || normalized["CELULAR"]),
          telefone2: stringOrEmpty(normalized["TELEFONE2"] || normalized["TEL2"]),
          vertical: stringOrEmpty(normalized["VERTICAL"] || normalized["SETOR"]),
          status: LeadStatus.NOVO,
          isWorked: false,
          raw: normalized,
        });
      }

      // Bulk Insert (createMany is efficient)
      if (leadsData.length > 0) {
        // Chunking to avoid limits if large
        const BATCH_SIZE = 1000;
        for (let i = 0; i < leadsData.length; i += BATCH_SIZE) {
          await prisma.lead.createMany({
            data: leadsData.slice(i, i + BATCH_SIZE),
            skipDuplicates: true, // Optional: avoid crashing on dupes if valid
          });
        }
        totalLeads = leadsData.length;
      }
    }

    return NextResponse.json({
      message: "Campanha criada com sucesso.",
      id: campanha.id,
      totalLeads,
    }, { status: 201 });

  } catch (error) {
    console.error("Erro /api/campanhas/v2", error);
    return NextResponse.json({ message: "Erro interno." }, { status: 500 });
  }
}
