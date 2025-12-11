export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CampaignType, Office, Role } from "@prisma/client";

const ALLOWED_ROLES_FOR_CREATE: Role[] = [
  Role.MASTER,
  Role.GERENTE_SENIOR,
  Role.GERENTE_NEGOCIOS,
  Role.PROPRIETARIO,
];

const RESTRICTED_ROLES = new Set<Role>([Role.GERENTE_NEGOCIOS, Role.PROPRIETARIO]);

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

    if (!session?.user) {
      return NextResponse.json({ message: "Unauthorized (no session)" }, { status: 401 });
    }

    if (!session.user.role) {
      return NextResponse.json({ message: "Sem permissão para criar campanha." }, { status: 403 });
    }
    const role = session.user.role as Role;
    if (!ALLOWED_ROLES_FOR_CREATE.includes(role)) {
      return NextResponse.json({ message: "Sem permissão para criar campanha." }, { status: 403 });
    }

    const body = await req.json();
    const nome = (() => {
      if (!body.nome) return "";
      return String(body.nome).trim();
    })();
    const descricao = body.descricao ? String(body.descricao).trim() : undefined;
    const campaignType = parseCampaignType(body.type);
    const officeValue = parseOffice(body.office);

    if (!nome || !campaignType || !officeValue) {
      return NextResponse.json(
        { message: "Nome, tipo (Cockpit/Mapa_Parque) e escritório válidos são obrigatórios." },
        { status: 400 },
      );
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, office: true },
    });

    if (!currentUser) {
      return NextResponse.json({ message: "Usuário não encontrado." }, { status: 404 });
    }

    if (RESTRICTED_ROLES.has(role) && currentUser.office !== officeValue) {
      return NextResponse.json({ message: "Você só pode criar campanha para o seu escritório." }, { status: 403 });
    }

    const campanha = await prisma.campanha.create({
      data: {
        nome,
        descricao: descricao || null,
        type: campaignType,
        tipo: campaignType,
        office: officeValue,
        createdById: currentUser.id,
      },
    });

    return NextResponse.json(campanha, { status: 201 });
  } catch (error) {
    console.error("Error creating campaign:", error);
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}
