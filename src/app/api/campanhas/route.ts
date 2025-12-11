export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CampaignType, Office } from "@prisma/client";

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
  const values = Object.values(Office) as string[];
  return values.includes(raw) ? (raw as Office) : null;
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !session.user.email) {
      console.error("[API /campanhas] Sem sessão válida", session);
      return NextResponse.json({ message: "Não autenticado." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const nome = typeof body.nome === "string" ? body.nome.trim() : "";
    const descricao = typeof body.descricao === "string" ? body.descricao.trim() : undefined;
    const campaignType = parseCampaignType(body.type);
    const officeValue = parseOffice(body.office);

    if (!nome || !campaignType || !officeValue) {
      return NextResponse.json(
        { message: "Nome, tipo e escritório são obrigatórios." },
        { status: 400 },
      );
    }

    const campanha = await prisma.campanha.create({
      data: {
        nome,
        descricao: descricao || null,
        type: campaignType,
        tipo: campaignType,
        office: officeValue,
        ...(session.user.id ? { createdById: session.user.id } : {}),
      },
    });

    return NextResponse.json(campanha, { status: 201 });
  } catch (error) {
    console.error("[API /campanhas] Erro ao criar campanha", error);
    return NextResponse.json(
      { message: "Erro interno ao criar campanha." },
      { status: 500 },
    );
  }
}
