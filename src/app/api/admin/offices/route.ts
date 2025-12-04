export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Office, Role } from "@prisma/client";
import { isGerenteSenior, isMaster, canManageUsers } from "@/lib/authRoles";
import { ensureUserOffice } from "@/lib/userOffice";

const OFFICE_INCLUDE = {
  senior: { select: { id: true, name: true, email: true } },
  businessManager: { select: { id: true, name: true, email: true } },
  owner: { select: { id: true, name: true, email: true } },
};

function hasOfficePermission(role?: Role): boolean {
  return Boolean(role && canManageUsers(role));
}

function canManageOffice(role?: Role): boolean {
  return Boolean(role && (isMaster(role) || isGerenteSenior(role)));
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!hasOfficePermission(session.user.role)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const offices = await prisma.officeRecord.findMany({
    include: OFFICE_INCLUDE,
    orderBy: { name: "asc" },
  });
  const mapped = offices.map((office) => ({
    id: office.id,
    name: office.name,
    office: office.office,
    senior: office.senior,
    businessManager: office.businessManager,
    owner: office.owner,
  }));
  return NextResponse.json(mapped);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!canManageOffice(session.user.role)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const payload = await req.json().catch(() => ({}));
  const code = (payload.code ?? "").toString().trim().toUpperCase() as Office;
  const name = (payload.name ?? "").toString().trim();
  const seniorId = payload.seniorId as string | undefined;
  const businessManagerId = payload.businessManagerId as string | undefined;
  const ownerId = payload.ownerId as string | undefined;

  if (!code) {
    return NextResponse.json({ message: "Código do escritório é obrigatório" }, { status: 400 });
  }
  if (!Object.values(Office).includes(code)) {
    return NextResponse.json({ message: "Código de escritório inválido" }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ message: "Nome do escritório é obrigatório" }, { status: 400 });
  }

  const existing = await prisma.officeRecord.findUnique({ where: { office: code } });
  if (existing) {
    return NextResponse.json({ message: "Escritório já cadastrado" }, { status: 409 });
  }

  try {
    const office = await prisma.officeRecord.create({
      data: {
        office: code,
        name,
        ...(seniorId ? { senior: { connect: { id: seniorId } } } : {}),
        ...(businessManagerId ? { businessManager: { connect: { id: businessManagerId } } } : {}),
        ...(ownerId ? { owner: { connect: { id: ownerId } } } : {}),
      },
      include: OFFICE_INCLUDE,
    });

    await Promise.all([
      seniorId ? ensureUserOffice(seniorId, code) : Promise.resolve(),
      businessManagerId ? ensureUserOffice(businessManagerId, code) : Promise.resolve(),
      ownerId ? ensureUserOffice(ownerId, code) : Promise.resolve(),
    ]);

    return NextResponse.json(
      {
        id: office.id,
        name: office.name,
        office: office.office,
        senior: office.senior,
        businessManager: office.businessManager,
        owner: office.owner,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error in /api/admin/offices POST:", error);
    return NextResponse.json({ message: "Erro ao criar escritório" }, { status: 500 });
  }
}
