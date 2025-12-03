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

  const batchId = params.id;
  const leads = await prisma.lead.findMany({ where: { importBatchId: batchId }, select: { id: true } });
  const leadIds = leads.map((l) => l.id);

  const deletedActivities =
    leadIds.length > 0 ? await prisma.leadActivity.deleteMany({ where: { leadId: { in: leadIds } } }) : { count: 0 };
  const deletedLeads = await prisma.lead.deleteMany({ where: { importBatchId: batchId } });
  const deletedBatch = await prisma.importBatch.deleteMany({ where: { id: batchId } });

  return NextResponse.json({
    deletedBatchCount: deletedBatch.count,
    deletedLeadsCount: deletedLeads.count,
    deletedActivitiesCount: deletedActivities.count,
  });
}
