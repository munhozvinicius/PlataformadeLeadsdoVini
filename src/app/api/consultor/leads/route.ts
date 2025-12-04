import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma, Role } from "@prisma/client";
import { getOwnerTeamIds } from "@/lib/auth-helpers";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const searchParams = req.nextUrl.searchParams;
  const consultantId = searchParams.get("consultantId");
  const campaignId = searchParams.get("campaignId");

  const where: Prisma.LeadWhereInput = {};
  if (campaignId) where.campanhaId = campaignId;

  if (session.user.role === Role.CONSULTOR) {
    where.consultorId = session.user.id;
  } else if (session.user.role === Role.PROPRIETARIO) {
    const allowedIds = await getOwnerTeamIds(session.user.id);
    if (consultantId) {
      if (!allowedIds.includes(consultantId)) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
      }
      where.consultorId = consultantId;
    } else {
      where.consultorId = { in: allowedIds };
    }
  } else {
    if (consultantId) where.consultorId = consultantId;
  }

  const leads = await prisma.lead.findMany({
    where,
    include: {
      campanha: true,
      consultor: { select: { id: true, name: true, email: true } },
    },
    orderBy: [
      { status: "asc" },
      { nextFollowUpAt: "asc" },
      { updatedAt: "desc" },
    ],
  });

  return NextResponse.json(leads);
}
