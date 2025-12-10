export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { slugifyOfficeCode } from "@/lib/officeSlug";


function canAccessOffices(role?: Role) {
  return role === Role.MASTER || role === Role.GERENTE_SENIOR || role === Role.GERENTE_NEGOCIOS;
}



export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessOffices(session.user.role)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const role = session.user.role;
  let where = {};

  if (role === Role.GERENTE_NEGOCIOS) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { managedOffices: true }
    });
    const officeIds = user?.managedOffices.map(mo => mo.officeRecordId) || [];
    where = { id: { in: officeIds } };
  }

  const offices = await prisma.officeRecord.findMany({
    where,
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
  if (!session?.user || !canAccessOffices(session.user.role)) {
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
      // If creator is GN, automatically associate them as a manager
      ...(session.user.role === Role.GERENTE_NEGOCIOS ? {
        businessManager: { connect: { id: session.user.id } },
        managers: {
          create: { managerId: session.user.id }
        }
      } : {})
    },
  });
  return NextResponse.json(office, { status: 201 });
}
