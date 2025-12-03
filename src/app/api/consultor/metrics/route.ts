export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LeadStatus, Role } from "@prisma/client";
import { getOwnerTeamIds } from "@/lib/auth-helpers";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const campaignId = req.nextUrl.searchParams.get("campaignId");
  const where: Record<string, unknown> = {};

  if (campaignId && campaignId !== "all") {
    where.campanhaId = campaignId;
  }

  if (session.user.role === Role.CONSULTOR) {
    where.consultorId = session.user.id;
  } else if (session.user.role === Role.OWNER) {
    const teamIds = await getOwnerTeamIds(session.user.id);
    where.consultorId = { in: teamIds };
  } else if (session.user.role === Role.MASTER) {
    // optional consultorId filter
    const consultantId = req.nextUrl.searchParams.get("consultantId");
    if (consultantId) where.consultorId = consultantId;
  }

  const leads = await prisma.lead.findMany({ where, select: { id: true, status: true } });
  const leadIds = leads.map((l) => l.id);
  const totalLeads = leadIds.length;
  const workedLeads = leads.filter((l) => l.status !== LeadStatus.NOVO).length;
  const contactRate = totalLeads === 0 ? 0 : Math.round((workedLeads * 100) / totalLeads);
  const negotiationStatuses: LeadStatus[] = [LeadStatus.EM_NEGOCIACAO, LeadStatus.FECHADO];
  const negotiationCount = leads.filter((l) => negotiationStatuses.includes(l.status)).length;
  const negotiationRate = totalLeads === 0 ? 0 : Math.round((negotiationCount * 100) / totalLeads);
  const closedCount = leads.filter((l) => l.status === LeadStatus.FECHADO).length;
  const closeRate = totalLeads === 0 ? 0 : Math.round((closedCount * 100) / totalLeads);

  const lossReasons = await prisma.leadActivity.groupBy({
    by: ["outcomeLabel"],
    where: {
      outcomeLabel: { not: null },
      campaignId: (where.campanhaId as string | undefined) ?? undefined,
    },
    _count: { outcomeLabel: true },
    orderBy: { _count: { outcomeLabel: "desc" } },
    take: 5,
  });

  const totalActivities = await prisma.leadActivity.count({
    where: {
      campaignId: (where.campanhaId as string | undefined) ?? undefined,
      leadId: leadIds.length > 0 ? { in: leadIds } : undefined,
    },
  });
  const avgActivities = totalLeads === 0 ? 0 : Number((totalActivities / totalLeads).toFixed(2));

  const today = new Date();
  const endNextWeek = new Date(today);
  endNextWeek.setDate(today.getDate() + 7);
  const followUps = await prisma.lead.count({
    where: {
      ...where,
      nextFollowUpAt: {
        gte: new Date(today.toDateString()),
        lte: endNextWeek,
      },
    },
  });

  return NextResponse.json({
    totalLeads,
    workedLeads,
    notWorkedLeads: totalLeads - workedLeads,
    contactRate,
    negotiationRate,
    closeRate,
    lossReasons,
    avgActivities,
    followUps,
  });
}
