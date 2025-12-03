export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role, LeadStatus } from "@prisma/client";

type Params = { params: { id: string } };

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role === Role.CONSULTOR) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { consultantIds, quantityPerConsultant } = body as {
    consultantIds?: string[];
    quantityPerConsultant?: number;
  };

  if (!Array.isArray(consultantIds) || consultantIds.length === 0) {
    return NextResponse.json({ message: "Selecione pelo menos um consultor" }, { status: 400 });
  }
  if (!quantityPerConsultant || quantityPerConsultant <= 0) {
    return NextResponse.json({ message: "Quantidade inválida" }, { status: 400 });
  }

  const campaignId = params.id;
  const totalNeeded = quantityPerConsultant * consultantIds.length;
  const stockLeads = await prisma.lead.findMany({
    where: { campanhaId: campaignId, status: LeadStatus.NOVO, consultorId: null },
    orderBy: { createdAt: "asc" },
    take: totalNeeded,
    select: { id: true },
  });
  if (stockLeads.length === 0) {
    return NextResponse.json({ message: "Estoque vazio" }, { status: 400 });
  }

  const distributed: Record<string, number> = {};
  let cursor = 0;
  for (const consultantId of consultantIds) {
    const slice = stockLeads.slice(cursor, cursor + quantityPerConsultant);
    cursor += quantityPerConsultant;
    if (slice.length === 0) {
      distributed[consultantId] = 0;
      continue;
    }
    await prisma.lead.updateMany({
      where: { id: { in: slice.map((s) => s.id) } },
      data: { consultorId: consultantId, status: LeadStatus.NOVO, isWorked: false, lastStatusChangeAt: new Date() },
    });
    distributed[consultantId] = slice.length;
  }

  const remainingStock = await prisma.lead.count({
    where: { campanhaId: campaignId, status: LeadStatus.NOVO, consultorId: null },
  });

  return NextResponse.json({ success: true, distributed, remainingStock });
}
