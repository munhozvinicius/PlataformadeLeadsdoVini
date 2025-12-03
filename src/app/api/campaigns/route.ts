export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role === Role.CONSULTOR) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const campaigns = await prisma.campanha.findMany({
    orderBy: { createdAt: "desc" },
  });

  const campaignIds = campaigns.map((c) => c.id);
  const counts = await prisma.lead.groupBy({
    by: ["campanhaId"],
    _count: { _all: true },
    where: { campanhaId: { in: campaignIds } },
  });
  const assignedCounts = await prisma.lead.groupBy({
    by: ["campanhaId"],
    _count: { _all: true },
    where: { campanhaId: { in: campaignIds }, consultorId: { not: null } },
  });

  const countsMap = new Map(counts.map((c) => [c.campanhaId, c._count._all]));
  const assignedMap = new Map(assignedCounts.map((c) => [c.campanhaId, c._count._all]));

  const response = campaigns.map((c) => {
    const total = countsMap.get(c.id) ?? 0;
    const atribu = assignedMap.get(c.id) ?? 0;
    return {
      ...c,
      totalLeads: total,
      atribuidos: atribu,
      restantes: total - atribu,
    };
  });

  return NextResponse.json(response);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role === Role.CONSULTOR) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { nome, descricao, objetivo, vertical, dataInicio, dataFim } = body;
  if (!nome) return NextResponse.json({ message: "Nome é obrigatório" }, { status: 400 });

  const campaign = await prisma.campanha.create({
    data: {
      nome,
      descricao: descricao || null,
      objetivo: objetivo || null,
      vertical: vertical || null,
      periodoInicio: dataInicio ? new Date(dataInicio) : null,
      periodoFim: dataFim ? new Date(dataFim) : null,
      createdById: session.user.id,
    },
  });

  return NextResponse.json(campaign, { status: 201 });
}
