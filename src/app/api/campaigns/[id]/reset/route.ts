export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LeadStatus, Role } from "@prisma/client";

type Params = { params: { id: string } };

export async function POST(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== Role.MASTER) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const campaignId = params.id;
  const resetResult = await prisma.lead.updateMany({
    where: { campanhaId: campaignId },
    data: {
      consultorId: null,
      ownerId: null,
      officeId: null,
      status: LeadStatus.NOVO,
      isWorked: false,
      nextFollowUpAt: null,
      nextStepNote: null,
      lastStatusChangeAt: null,
      lastActivityAt: null,
      lastInteractionAt: null,
      lastOutcomeCode: null,
      lastOutcomeLabel: null,
      lastOutcomeNote: null,
    },
  });

  return NextResponse.json({
    resetCount: resetResult.count,
    message: "Campanha resetada com sucesso.",
  });
}
