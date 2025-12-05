import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isOfficeAdmin } from "@/lib/authRoles";
import { LeadStatus, Prisma, Role } from "@prisma/client";

type Params = { params: { id: string } };

const allowedStatuses = new Set(Object.values(LeadStatus));
const palitagemNegativa = [
  "Telefone inválido",
  "Não pertence à empresa",
  "Empresa fechada",
  "Sem interesse",
  "Concorrência",
  "Orçamento baixo",
  "Ficou de ligar e sumiu",
  "Cliente não atende",
  "Não é o decisor / Sem contato do decisor",
  "Prospecção incorreta (CNAE/Vertical errada)",
  "Lead duplicado",
  "Outro",
];

export async function POST(req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { status, motivo, observacao } = await req.json();
  if (!status || !allowedStatuses.has(status)) {
    return NextResponse.json({ message: "Status inválido" }, { status: 400 });
  }

  if (status === LeadStatus.PERDIDO) {
    if (!motivo || !palitagemNegativa.includes(motivo)) {
      return NextResponse.json({ message: "Motivo é obrigatório para perdido" }, { status: 400 });
    }
    if (motivo === "Outro" && !observacao) {
      return NextResponse.json({ message: "Observação obrigatória para motivo Outro" }, { status: 400 });
    }
  }

  const lead = await prisma.lead.findUnique({ where: { id: params.id } });
  if (!lead) {
    return NextResponse.json({ message: "Lead não encontrado" }, { status: 404 });
  }

  // Permissões básicas: consultor só atualiza o próprio lead; owner/master liberados.
  const role = session.user.role as Role;
  if (role === Role.CONSULTOR && lead.consultorId !== session.user.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (role === Role.PROPRIETARIO && lead.ownerId !== session.user.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const sessionUser = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!sessionUser) {
    return NextResponse.json({ message: "Sessão inválida" }, { status: 401 });
  }

  if (
    isOfficeAdmin(role) &&
    role !== Role.MASTER &&
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
    date: new Date().toISOString(),
    type: "MUDANCA_STATUS",
    message:
      status === LeadStatus.PERDIDO
        ? `Lead marcado como perdido. Motivo: ${motivo}. Observação: ${observacao ?? ""}`
        : `Status alterado para ${status}`,
    userId: session.user.id,
  });

  const now = new Date();
  const updated = await prisma.lead.update({
    where: { id: params.id },
    data: {
      status,
      isWorked: true,
      lastStatusChangeAt: now,
      lastInteractionAt: now,
      lastActivityAt: now,
      interactionCount: (lead.interactionCount ?? 0) + 1,
      historico: historicoAtual as Prisma.JsonArray,
      lastOutcomeCode: status === LeadStatus.PERDIDO ? motivo ?? status : lead.lastOutcomeCode,
      lastOutcomeLabel: status === LeadStatus.PERDIDO ? motivo : lead.lastOutcomeLabel,
      lastOutcomeNote: observacao ?? lead.lastOutcomeNote ?? null,
      nextFollowUpAt: null,
      nextStepNote: null,
    },
  });

  const motiveLabel = motivo ?? status;
  const activityNote =
    status === LeadStatus.PERDIDO
      ? `Perdido. Motivo: ${motiveLabel}. Observação: ${observacao ?? ""}`
      : `Status alterado para ${status}`;

  await prisma.leadActivity.create({
    data: {
      leadId: lead.id,
      campaignId: lead.campanhaId,
      userId: session.user.id,
      activityType: "STATUS_CHANGE",
      stageBefore: lead.status,
      stageAfter: status,
      note: activityNote,
    },
  });

  await prisma.leadEvent.create({
    data: {
      leadId: lead.id,
      userId: session.user.id,
      type: "STATUS",
      payload: {
        from: lead.status,
        to: status,
        motivo,
        observacao,
      },
    },
  });

  return NextResponse.json(updated);
}
