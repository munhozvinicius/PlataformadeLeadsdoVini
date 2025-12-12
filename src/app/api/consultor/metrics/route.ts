export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LeadStatus, Prisma, Role } from "@prisma/client";
import { getOwnerTeamIds } from "@/lib/auth-helpers";
import { isOfficeAdmin } from "@/lib/authRoles";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const campaignId = req.nextUrl.searchParams.get("campaignId");
  const consultantId = req.nextUrl.searchParams.get("consultantId");
  const officeIds = (req.nextUrl.searchParams.get("officeIds") || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const where: Prisma.LeadWhereInput = {};

  if (campaignId && campaignId !== "all") {
    where.campanhaId = campaignId;
  }

  const sessionUser = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!sessionUser) {
    return NextResponse.json({ message: "Sessão inválida" }, { status: 401 });
  }

  if (session.user.role === Role.CONSULTOR) {
    where.consultorId = session.user.id;
  } else if (session.user.role === Role.PROPRIETARIO) {
    const teamIds = await getOwnerTeamIds(session.user.id);
    if (consultantId) {
      if (!teamIds.includes(consultantId)) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
      }
      where.consultorId = consultantId;
    } else {
      where.consultorId = { in: teamIds };
    }
  } else if (isOfficeAdmin(session.user.role)) {
    if (!sessionUser.officeRecordId) {
      return NextResponse.json({ message: "Office inválido" }, { status: 401 });
    }
    where.officeId = sessionUser.officeRecordId;
    if (consultantId) where.consultorId = consultantId;
  } else if (consultantId) {
    where.consultorId = consultantId;
  }

  if (officeIds.length > 0) {
    if (typeof where.officeId === "string") {
      // Already locked; keep existing filter
    } else {
      where.officeId = { in: officeIds };
    }
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

  const now = new Date();
  const startToday = new Date(now.toDateString());
  const endNextWeek = new Date(now);
  endNextWeek.setDate(now.getDate() + 7);

  const scheduledFollowUps = await prisma.lead.count({
    where: {
      ...where,
      nextStepNote: "FOLLOW_UP",
      nextFollowUpAt: {
        gte: startToday,
      },
    },
  });

  const scheduledMeetings = await prisma.lead.count({
    where: {
      ...where,
      nextStepNote: "REUNIAO",
      nextFollowUpAt: {
        gte: startToday,
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
    followUps: scheduledFollowUps,
    scheduledMeetings,
    scheduledFollowUps,
  });
}
