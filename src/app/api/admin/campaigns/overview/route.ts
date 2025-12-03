export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role === Role.CONSULTOR) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const campaignId = req.nextUrl.searchParams.get("campaignId");
  if (!campaignId) {
    return NextResponse.json({ message: "campaignId obrigatório" }, { status: 400 });
  }

  const campaign = await prisma.campanha.findUnique({ where: { id: campaignId } });
  if (!campaign) return NextResponse.json({ message: "Campanha não encontrada" }, { status: 404 });

  const totalLeads = await prisma.lead.count({ where: { campanhaId: campaignId } });
  const estoque = await prisma.lead.count({ where: { campanhaId: campaignId, consultorId: null } });
  const atribuídos = await prisma.lead.count({ where: { campanhaId: campaignId, consultorId: { not: null } } });
  const fechados = await prisma.lead.count({ where: { campanhaId: campaignId, status: "FECHADO" } });
  const perdidos = await prisma.lead.count({ where: { campanhaId: campaignId, status: "PERDIDO" } });

  const batches = await prisma.importBatch.findMany({
    where: { campaignId },
    orderBy: { createdAt: "desc" },
  });

  const porConsultor = await prisma.lead.groupBy({
    by: ["consultorId", "status"],
    _count: { status: true },
    where: { campanhaId: campaignId, consultorId: { not: null } },
  });

  return NextResponse.json({
    campaign,
    resumo: { totalLeads, estoque, atribuidos: atribuídos, fechados, perdidos },
    batches,
    distribuicao: porConsultor,
  });
}
