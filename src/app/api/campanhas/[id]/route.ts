export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

type Params = { params: { id: string } };

export async function DELETE(_req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== Role.MASTER) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const campaignId = params.id;
  const leads = await prisma.lead.findMany({
    where: { campanhaId: campaignId },
    select: { id: true, status: true },
  });
  const targetIds = leads.filter((l) => l.status !== "FECHADO").map((l) => l.id);

  const deletedActivities =
    targetIds.length > 0
      ? await prisma.leadActivity.deleteMany({ where: { leadId: { in: targetIds } } })
      : { count: 0 };
  const deletedLeads = await prisma.lead.deleteMany({
    where: { campanhaId: campaignId, status: { not: "FECHADO" } },
  });
  const deletedBatches = await prisma.importBatch.deleteMany({ where: { campaignId: campaignId } });

  return NextResponse.json({
    deletedLeadsCount: deletedLeads.count,
    deletedActivitiesCount: deletedActivities.count,
    deletedBatchesCount: deletedBatches.count,
  });
}
