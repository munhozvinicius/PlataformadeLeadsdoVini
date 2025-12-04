export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { slugifyOfficeCode } from "@/lib/officeSlug";

function isOfficeAdmin(role?: Role) {
  return role === Role.MASTER || role === Role.GERENTE_SENIOR;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isOfficeAdmin(session.user.role)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const offices = await prisma.officeRecord.findMany({
    select: {
      id: true,
      code: true,
      name: true,
      createdAt: true,
    },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(offices);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isOfficeAdmin(session.user.role)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const name = (body.name ?? "").toString().trim();
  if (!name) {
    return NextResponse.json({ message: "Nome do escritório é obrigatório" }, { status: 400 });
  }
  const code = slugifyOfficeCode(name);
  const office = await prisma.officeRecord.create({
    data: {
      code,
      name,
    },
  });
  return NextResponse.json(office, { status: 201 });
}
