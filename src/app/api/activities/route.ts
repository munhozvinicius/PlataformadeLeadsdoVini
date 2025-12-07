export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { ActivityChannel, LeadStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser, leadsAccessFilter } from "@/lib/auth-helpers";
import { Prisma } from "@prisma/client";

function parseChannel(raw: string | null): ActivityChannel | null {
  if (!raw) return null;
  const normalized = raw.trim().toUpperCase().replace("-", "_");
  if (normalized === "TELEFONE") return ActivityChannel.TELEFONE;
  if (normalized === "WHATSAPP") return ActivityChannel.WHATSAPP;
  if (normalized === "EMAIL" || normalized === "E-MAIL") return ActivityChannel.EMAIL;
  if (normalized === "VISITA") return ActivityChannel.VISITA;
  if (normalized === "OUTRO" || normalized === "OUTROS") return ActivityChannel.OUTRO;
  return null;
}

export async function GET(req: NextRequest) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const searchParams = req.nextUrl.searchParams;
  const leadId = searchParams.get("leadId") ?? searchParams.get("companyId");
  if (!leadId) {
    return NextResponse.json({ message: "leadId is required" }, { status: 400 });
  }

  const accessFilter = await leadsAccessFilter(sessionUser);
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, ...accessFilter },
  });
  if (!lead) {
    return NextResponse.json({ message: "Not found or unauthorized" }, { status: 404 });
  }

  let whereClause: Prisma.LeadActivityWhereInput = { leadId };

  if (sessionUser.role === "CONSULTOR") {
    whereClause = {
      leadId,
      OR: [
        { userId: sessionUser.id },
        { user: { role: { in: ["MASTER", "GERENTE_SENIOR", "GERENTE_NEGOCIOS", "PROPRIETARIO"] } } },
      ],
    };
  }

  const activities = await prisma.leadActivity.findMany({
    where: whereClause,
    include: { user: { select: { id: true, name: true, email: true, role: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(activities);
}

type PostBody = {
  leadId?: string;
  companyId?: string;
  activityType?: string;
  channel?: string | null;
  outcomeCode?: string | null;
  outcomeLabel?: string | null;
  note?: string | null;
  newStage?: LeadStatus | null;
  nextFollowUpAt?: string | null;
  nextStepNote?: string | null;
};

export async function POST(req: NextRequest) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as PostBody;
  const leadId = body.leadId ?? body.companyId;
  const {
    activityType,
    channel = null,
    outcomeCode,
    outcomeLabel,
    note,
    newStage,
    nextFollowUpAt,
    nextStepNote,
  } = body;

  if (!leadId || !activityType || !note) {
    return NextResponse.json({ message: "leadId, activityType and note are required" }, { status: 400 });
  }

  const accessFilter = await leadsAccessFilter(sessionUser);
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, ...accessFilter },
  });
  if (!lead) {
    return NextResponse.json({ message: "Not found or unauthorized" }, { status: 404 });
  }

  const stageBefore = lead.status;
  const stageAfter = newStage && Object.values(LeadStatus).includes(newStage) ? newStage : lead.status;
  const followUpDate = nextFollowUpAt ? new Date(nextFollowUpAt) : null;
  const now = new Date();

  const historicoAtual: Record<string, unknown>[] = Array.isArray(lead.historico)
    ? (lead.historico as Record<string, unknown>[])
    : [];
  historicoAtual.push({
    date: now.toISOString(),
    type: "ATIVIDADE",
    activityType,
    channel,
    note,
    stageBefore,
    stageAfter,
    outcomeCode,
    outcomeLabel,
    nextFollowUpAt: followUpDate ? followUpDate.toISOString() : null,
    userId: sessionUser.id,
  });

  const activity = await prisma.leadActivity.create({
    data: {
      leadId,
      userId: sessionUser.id,
      campaignId: lead.campanhaId,
      activityType,
      channel: parseChannel(channel),
      outcomeCode: outcomeCode || undefined,
      outcomeLabel: outcomeLabel || undefined,
      note,
      stageBefore,
      stageAfter,
      nextFollowUpAt: followUpDate ?? undefined,
      nextStepNote: nextStepNote || undefined,
    },
    include: { user: { select: { id: true, name: true, email: true, role: true } } },
  });

  await prisma.lead.update({
    where: { id: leadId },
    data: {
      status: stageAfter,
      isWorked: true,
      lastActivityAt: now,
      lastInteractionAt: now,
      interactionCount: (lead.interactionCount ?? 0) + 1,
      lastOutcomeCode: outcomeCode || lead.lastOutcomeCode || undefined,
      lastOutcomeLabel: outcomeLabel || lead.lastOutcomeLabel || undefined,
      lastOutcomeNote: note,
      nextFollowUpAt: followUpDate,
      nextStepNote: nextStepNote || null,
      historico: historicoAtual as Prisma.JsonArray,
      lastStatusChangeAt: stageAfter !== lead.status ? now : lead.lastStatusChangeAt,
    },
  });

  return NextResponse.json(activity, { status: 201 });
}
