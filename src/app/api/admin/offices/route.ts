export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

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
      office: true,
      name: true,
      createdAt: true,
    },
    orderBy: { name: "asc" },
  });
  const payload = offices.map((office) => ({
    id: office.id,
    code: office.office,
    name: office.name,
    createdAt: office.createdAt,
    senior: null,
    businessManager: null,
    owner: null,
  }));
  return NextResponse.json(payload);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isOfficeAdmin(session.user.role)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const code = (body.code ?? "").toString().trim().toUpperCase();
  const name = (body.name ?? "").toString().trim();

  if (!code) {
    return NextResponse.json({ message: "Código do escritório é obrigatório" }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ message: "Nome do escritório é obrigatório" }, { status: 400 });
  }

  const office = await prisma.officeRecord.create({
    data: {
      office: code,
      name,
    },
  });

  return NextResponse.json(
    {
      id: office.id,
      code: office.office,
      name: office.name,
      createdAt: office.createdAt,
      senior: null,
      businessManager: null,
      owner: null,
    },
    { status: 201 }
  );
}
