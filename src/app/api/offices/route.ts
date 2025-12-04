export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PrismaClient, Role } from "@prisma/client";
import { slugifyOfficeCode } from "@/lib/officeSlug";

const prisma = new PrismaClient();

function isMaster(role?: Role) {
  return role === Role.MASTER;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isMaster(session.user.role)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const offices = await prisma.officeRecord.findMany({
    select: {
      id: true,
      code: true,
      name: true,
      createdAt: true,
      _count: {
        select: { users: true },
      },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(
    offices.map((office) => ({
      id: office.id,
      code: office.code,
      name: office.name,
      createdAt: office.createdAt,
      userCount: office._count?.users ?? 0,
    }))
  );
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isMaster(session.user.role)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as { name?: string };
  const name = (body.name ?? "").toString().trim();
  if (!name) {
    return NextResponse.json({ message: "Nome do escritório é obrigatório" }, { status: 400 });
  }
  const code = slugifyOfficeCode(name);
  const existing = await prisma.officeRecord.findUnique({ where: { code } });
  if (existing) {
    return NextResponse.json({ message: "Escritório já existe" }, { status: 409 });
  }

  const office = await prisma.officeRecord.create({
    data: { name, code },
    select: { id: true, code: true, name: true, createdAt: true },
  });

  return NextResponse.json(office, { status: 201 });
}
