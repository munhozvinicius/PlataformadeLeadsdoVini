export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role === Role.CONSULTOR) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { leadId, consultantId } = await req.json();
  if (!leadId || !consultantId) return NextResponse.json({ message: "leadId e consultantId são obrigatórios" }, { status: 400 });

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { officeId: true },
  });
  if (!lead) {
    return NextResponse.json({ message: "Lead não encontrada" }, { status: 404 });
  }

  const consultant = await prisma.user.findUnique({
    where: { id: consultantId },
    select: { officeId: true },
  });
  if (!consultant) {
    return NextResponse.json({ message: "Consultor não encontrado" }, { status: 404 });
  }

  if (lead.officeId && consultant.officeId && lead.officeId !== consultant.officeId) {
    return NextResponse.json(
      { message: "A reatribuição só pode ocorrer entre consultores do mesmo escritório." },
      { status: 400 }
    );
  }

  await prisma.lead.update({
    where: { id: leadId },
    data: {
      consultorId: consultantId,
      officeId: consultant.officeId ?? lead.officeId ?? null,
      isWorked: false,
    },
  });

  return NextResponse.json({ ok: true });
}
