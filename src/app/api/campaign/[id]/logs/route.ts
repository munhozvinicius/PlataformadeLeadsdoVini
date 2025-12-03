export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

type Params = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role === Role.CONSULTOR) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const campaignId = params.id;
  const activities = await prisma.leadActivity.findMany({
    where: { lead: { campanhaId: campaignId } },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true,
      activityType: true,
      outcomeLabel: true,
      createdAt: true,
      user: { select: { name: true, email: true } },
      lead: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
    },
  });

  return NextResponse.json({
    activities: activities.map((a) => ({
      id: a.id,
      action: a.activityType ?? a.outcomeLabel ?? "Atividade",
      user: a.user?.name ?? a.user?.email ?? "Usuário",
      lead: a.lead?.razaoSocial ?? a.lead?.nomeFantasia ?? "Lead",
      timestamp: a.createdAt,
    })),
    distributions: [],
  });
}
