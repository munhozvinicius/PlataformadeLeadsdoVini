export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOwnerTeamIds } from "@/lib/auth-helpers";
import { LeadStatus, Role } from "@prisma/client";

const MOTIVOS = new Set([
  "Não tem interesse",
  "Já possui solução",
  "Sem orçamento",
  "Não atende / Contato impossível",
  "Número inexistente",
  "Cliente fora do perfil",
  "Empresa não encontrada",
  "Em negociação com concorrente",
  "Encerrado por duplicidade",
  "Outro",
]);

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const leadId = req.nextUrl.searchParams.get("leadId");
  if (!leadId) return NextResponse.json({ message: "leadId é obrigatório" }, { status: 400 });

  const where: Record<string, unknown> = { leadId };
  if (session.user.role === Role.CONSULTOR) {
    where.userId = session.user.id;
  } else if (session.user.role === Role.PROPRIETARIO) {
    const teamIds = await getOwnerTeamIds(session.user.id);
    where.userId = { in: teamIds };
  }

  const losses = await prisma.leadLoss.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  return NextResponse.json(losses);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { leadId, motivo, justificativa } = await req.json();
  if (!leadId || !motivo || !justificativa) {
    return NextResponse.json({ message: "Campos obrigatórios ausentes" }, { status: 400 });
  }
  if (!MOTIVOS.has(motivo)) {
    return NextResponse.json({ message: "Motivo inválido" }, { status: 400 });
  }

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return NextResponse.json({ message: "Lead não encontrado" }, { status: 404 });

  if (session.user.role === Role.CONSULTOR && lead.consultorId !== session.user.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role === Role.PROPRIETARIO) {
    const teamIds = await getOwnerTeamIds(session.user.id);
    if (!teamIds.includes(lead.consultorId ?? "")) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
  }

  const loss = await prisma.leadLoss.create({
    data: { leadId, userId: session.user.id, motivo, justificativa },
  });

  await prisma.lead.update({
    where: { id: leadId },
    data: {
      status: LeadStatus.PERDIDO,
      lastActivityAt: new Date(),
      lastInteractionAt: new Date(),
      isWorked: true,
      lastOutcomeLabel: motivo,
      lastOutcomeNote: justificativa,
    },
  });

  await prisma.leadActivity.create({
    data: {
      leadId,
      userId: session.user.id,
      campaignId: lead.campanhaId,
      activityType: "STATUS_CHANGE",
      outcomeLabel: motivo,
      note: justificativa,
      stageBefore: lead.status,
      stageAfter: LeadStatus.PERDIDO,
    },
  });

  return NextResponse.json(loss, { status: 201 });
}
