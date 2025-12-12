import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma, Role } from "@prisma/client";
import { getOwnerTeamIds } from "@/lib/auth-helpers";
import { isOfficeAdmin } from "@/lib/authRoles";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const searchParams = req.nextUrl.searchParams;
  const consultantId = searchParams.get("consultantId");
  const campaignId = searchParams.get("campaignId");
  const officeIds = (searchParams.get("officeIds") || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  const where: Prisma.LeadWhereInput = {};
  if (campaignId) where.campanhaId = campaignId;

  const sessionUser = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!sessionUser) {
    return NextResponse.json({ message: "Sessão inválida" }, { status: 401 });
  }

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
  } else if (isOfficeAdmin(session.user.role)) {
    if (!sessionUser.officeRecordId) {
      return NextResponse.json({ message: "Office inválido" }, { status: 401 });
    }
    if (consultantId) {
      const consultant = await prisma.user.findUnique({ where: { id: consultantId } });
      if (!consultant || consultant.officeRecordId !== sessionUser.officeRecordId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
      }
      where.consultorId = consultantId;
    } else {
      where.officeId = sessionUser.officeRecordId;
    }
  } else {
    if (consultantId) where.consultorId = consultantId;
  }

  if (officeIds.length > 0) {
    // Narrow by offices while respecting any stricter filters above
    if (where.officeId && typeof where.officeId === "string") {
      // Already locked to one office (e.g., office admin); keep as is.
    } else if (where.officeId && typeof where.officeId === "object") {
      // Merge with existing filter if possible
      where.officeId = { in: officeIds };
    } else {
      where.officeId = { in: officeIds };
    }
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
