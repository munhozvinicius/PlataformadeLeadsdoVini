export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { companyAccessFilter, getSessionUser } from "@/lib/auth-helpers";
import { Role, LeadStatus, Prisma } from "@prisma/client";

type Params = { params: { id: string } };

export async function PATCH(req: Request, { params }: Params) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { stage } = body;

  const where: Prisma.LeadWhereInput = { id: params.id };

  if (sessionUser.role === Role.MASTER) {
    // all good
  } else if (sessionUser.role === Role.PROPRIETARIO) {
    Object.assign(where, await companyAccessFilter(sessionUser));
  } else {
    where.consultorId = sessionUser.id;
  }

  // Check if lead exists and user has access
  const company = await prisma.lead.findFirst({ where }); // Using findFirst instead of findUnique because we might filter by extra fields

  if (!company) {
    return NextResponse.json({ message: "Not found or unauthorized" }, { status: 404 });
  }

  // Update
  if (stage) {
    const updatedCompany = await prisma.lead.update({
      where: { id: company.id },
      data: {
        status: stage as LeadStatus,
      },
    });
    return NextResponse.json(updatedCompany);
  }

  return NextResponse.json(company);
}
