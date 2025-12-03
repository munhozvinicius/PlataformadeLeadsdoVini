export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { getOwnerTeamIds } from "@/lib/auth-helpers";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const searchParams = req.nextUrl.searchParams;
  const campaignId = searchParams.get("campaignId");

  const where: Record<string, unknown> = {};
  if (campaignId && campaignId !== "all") where.campanhaId = campaignId;
  if (session.user.role === Role.CONSULTOR) {
    where.consultorId = session.user.id;
  } else if (session.user.role === Role.OWNER) {
    const team = await getOwnerTeamIds(session.user.id);
    where.consultorId = { in: team };
  } else if (session.user.role === Role.MASTER) {
    const consultantId = searchParams.get("consultantId");
    if (consultantId) where.consultorId = consultantId;
  }

  const byStatus = await prisma.lead.groupBy({
    by: ["status"],
    _count: { status: true },
    where,
  });

  const weekly = await prisma.leadActivity.groupBy({
    by: ["createdAt"],
    _count: { createdAt: true },
    where: campaignId && campaignId !== "all" ? { campaignId } : undefined,
  });

  return NextResponse.json({
    byStatus: byStatus.map((s) => ({ status: s.status, count: s._count.status })),
    weekly: weekly.map((w) => ({ label: new Date(w.createdAt).toLocaleDateString("pt-BR"), count: w._count.createdAt })),
  });
}
