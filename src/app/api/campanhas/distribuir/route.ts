export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LeadStatus, Role } from "@prisma/client";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role === Role.CONSULTOR) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { campanhaId, consultorId, quantidade } = await req.json();
  if (!campanhaId || !consultorId || !quantidade || quantidade <= 0) {
    return NextResponse.json({ message: "Dados inválidos" }, { status: 400 });
  }

  const leadsNovos = await prisma.lead.findMany({
    where: { campanhaId, status: LeadStatus.NOVO, consultorId: null },
    orderBy: { createdAt: "asc" },
    take: quantidade,
    select: { id: true },
  });

  if (leadsNovos.length === 0) {
    return NextResponse.json({ message: "Sem leads disponíveis" }, { status: 400 });
  }

  await prisma.lead.updateMany({
    where: { id: { in: leadsNovos.map((l) => l.id) } },
    data: {
      consultorId,
      status: LeadStatus.NOVO,
      isWorked: false,
      nextFollowUpAt: null,
      nextStepNote: null,
      lastOutcomeCode: null,
      lastOutcomeLabel: null,
      lastOutcomeNote: null,
      lastActivityAt: null,
      lastInteractionAt: null,
    },
  });

  return NextResponse.json({ assigned: leadsNovos.length, atribuídos: leadsNovos.length });
}
