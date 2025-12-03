export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOwnerTeamIds } from "@/lib/auth-helpers";
import { Role } from "@prisma/client";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const leadId = req.nextUrl.searchParams.get("leadId");
  if (!leadId) return NextResponse.json({ message: "leadId é obrigatório" }, { status: 400 });

  const where: Record<string, unknown> = { leadId };
  if (session.user.role === Role.CONSULTOR) {
    where.userId = session.user.id;
  } else if (session.user.role === Role.OWNER) {
    const teamIds = await getOwnerTeamIds(session.user.id);
    where.userId = { in: teamIds };
  }

  const notes = await prisma.leadNote.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  return NextResponse.json(notes);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { leadId, tipo, conteudo } = await req.json();
  if (!leadId || !conteudo) {
    return NextResponse.json({ message: "leadId e conteudo são obrigatórios" }, { status: 400 });
  }

  // Permissão básica: consultor só mexe nos seus leads; owner nos da equipe; master liberado.
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return NextResponse.json({ message: "Lead não encontrado" }, { status: 404 });
  if (session.user.role === Role.CONSULTOR && lead.consultorId !== session.user.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role === Role.OWNER) {
    const teamIds = await getOwnerTeamIds(session.user.id);
    if (!teamIds.includes(lead.consultorId ?? "")) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
  }

  const note = await prisma.leadNote.create({
    data: { leadId, userId: session.user.id, tipo: tipo || "anotacao", conteudo },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  await prisma.lead.update({
    where: { id: leadId },
    data: { isWorked: true, lastActivityAt: new Date(), lastInteractionAt: new Date() },
  });

  return NextResponse.json(note, { status: 201 });
}
