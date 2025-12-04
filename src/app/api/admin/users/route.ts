export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Office, Role, Profile } from "@prisma/client";

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  profile: true,
  office: true,
  officeRecord: true,
  active: true,
  owner: { select: { id: true, name: true, email: true } },
};

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const role = session.user.role as Role;
  if (role !== Role.MASTER && role !== Role.PROPRIETARIO) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const where =
    role === Role.PROPRIETARIO
      ? { OR: [{ id: session.user.id }, { ownerId: session.user.id }] }
      : undefined;

  const users = await prisma.user.findMany({
    where,
    select: USER_SELECT,
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(users);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const role = session.user.role as Role;
  if (role !== Role.MASTER && role !== Role.PROPRIETARIO) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { name, email, password, role: targetRole, profile, office, ownerId } = body;

  if (!name || !email || !password || !targetRole || !office) {
    return NextResponse.json({ message: "Missing fields" }, { status: 400 });
  }

  if (targetRole !== Role.PROPRIETARIO && targetRole !== Role.CONSULTOR) {
    return NextResponse.json({ message: "Invalid role" }, { status: 400 });
  }

  const officeEnum = (Object.values(Office) as Office[]).find((o) => o === office);
  if (!officeEnum) {
    return NextResponse.json({ message: "Invalid office" }, { status: 400 });
  }

  let creatorOwnerId: string | null = null;

  if (targetRole === Role.CONSULTOR) {
    if (role === Role.PROPRIETARIO) {
      const owner = await prisma.user.findUnique({ where: { id: session.user.id } });
      if (!owner) {
        return NextResponse.json({ message: "Owner not found" }, { status: 400 });
      }
      if (owner.office !== officeEnum) {
        return NextResponse.json({ message: "Owner only creates consultants for own office" }, { status: 400 });
      }
      creatorOwnerId = owner.id;
    } else if (role === Role.MASTER) {
      if (!ownerId) {
        return NextResponse.json({ message: "Consultor precisa de proprietário" }, { status: 400 });
      }
      const owner = await prisma.user.findUnique({ where: { id: ownerId } });
      if (!owner || owner.role !== Role.PROPRIETARIO) {
        return NextResponse.json({ message: "Owner inválido" }, { status: 400 });
      }
      creatorOwnerId = owner.id;
    }
  } else if (role === Role.PROPRIETARIO) {
    return NextResponse.json({ message: "Proprietário só cria consultor" }, { status: 401 });
  }

  const hashed = await bcrypt.hash(password, 10);
  const officeRecord = await prisma.officeRecord.findUnique({ where: { office: officeEnum } });
  if (!officeRecord) {
    return NextResponse.json({ message: "Escritório não encontrado" }, { status: 400 });
  }

  const profileValue = (profile ?? targetRole) as Profile | undefined;
  if (!profileValue || !Object.values(Profile).includes(profileValue)) {
    return NextResponse.json({ message: "Invalid profile" }, { status: 400 });
  }

  try {
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashed,
        role: targetRole,
        profile: profileValue,
        office: officeEnum,
        officeRecord: {
          connect: {
            id: officeRecord.id,
          },
        },
        ...(targetRole === Role.CONSULTOR && creatorOwnerId
          ? { owner: { connect: { id: creatorOwnerId } } }
          : {}),
        active: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        profile: true,
        office: true,
        officeRecord: true,
        owner: true,
      },
    });

    return NextResponse.json(user, { status: 201 });
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === "P2002") {
      return NextResponse.json({ message: "Email já cadastrado" }, { status: 409 });
    }
    return NextResponse.json({ message: "Erro ao criar usuário" }, { status: 500 });
  }
}
