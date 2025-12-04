export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isMaster } from "@/lib/authRoles";
import { LeadStatus, Role, Prisma } from "@prisma/client";

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role === Role.CONSULTOR) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { leadId, novoConsultorId, observacao } = await req.json();
  if (!leadId || !novoConsultorId) {
    return NextResponse.json({ message: "Dados inválidos" }, { status: 400 });
  }

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return NextResponse.json({ message: "Lead não encontrado" }, { status: 404 });

  const sessionUser = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!sessionUser) {
    return NextResponse.json({ message: "Sessão inválida" }, { status: 401 });
  }

  if (
    !isMaster(session.user.role) &&
    sessionUser.officeRecordId &&
    lead.officeId &&
    sessionUser.officeRecordId !== lead.officeId
  ) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const historicoAtual: Record<string, unknown>[] = Array.isArray(lead.historico)
    ? (lead.historico as Record<string, unknown>[])
    : [];
  historicoAtual.push({
    tipo: "REATRIBUICAO",
    de: lead.consultorId ?? null,
    para: novoConsultorId,
    observacao: observacao ?? null,
    em: new Date().toISOString(),
  });

  await prisma.lead.update({
    where: { id: leadId },
    data: {
      consultorId: novoConsultorId,
      status: LeadStatus.NOVO,
      isWorked: false,
      nextFollowUpAt: null,
      nextStepNote: null,
      lastOutcomeCode: null,
      lastOutcomeLabel: null,
      lastOutcomeNote: null,
      lastActivityAt: null,
      lastInteractionAt: null,
      historico: historicoAtual as Prisma.JsonArray,
    },
  });

  const activityNote = `Reatribuído de ${lead.consultorId ?? "nenhum consultor"} para ${novoConsultorId}${
    observacao ? ` - ${observacao}` : ""
  }`;
  await prisma.leadActivity.create({
    data: {
      leadId: lead.id,
      campaignId: lead.campanhaId,
      userId: session.user.id,
      activityType: "REASSIGN",
      stageBefore: lead.status,
      stageAfter: LeadStatus.NOVO,
      note: activityNote,
    },
  });

  return NextResponse.json({ ok: true });
}
