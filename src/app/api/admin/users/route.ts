export const dynamic = "force-dynamic";

import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
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
  officeRecord: { select: { id: true } },
  owner: { select: { id: true, name: true, email: true } },
  active: true,
};

async function fetchDefaultOffice() {
  const officeRecord = await prisma.officeRecord.findUnique({ where: { office: Office.SAFE_TI } });
  if (officeRecord) return officeRecord;
  return prisma.officeRecord.findFirst();
}

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

  const sessionRole = session.user.role as Role;
  const body = await req.json();
  const { name, email, password, role, officeId, ownerId } = body;

  if (!name || !email || !password || !role) {
    return NextResponse.json({ message: "Dados insuficientes" }, { status: 400 });
  }

  if (!Object.values(Role).includes(role)) {
    return NextResponse.json({ message: "Perfil inválido" }, { status: 400 });
  }

  if (sessionRole === Role.PROPRIETARIO && role !== Role.CONSULTOR) {
    return NextResponse.json({ message: "Proprietário só pode criar consultores" }, { status: 401 });
  }

  const sessionUser = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!sessionUser) {
    return NextResponse.json({ message: "Sessão inválida" }, { status: 401 });
  }

  const officeRecord =
    officeId && role !== Role.MASTER && role !== Role.GERENTE_SENIOR
      ? await prisma.officeRecord.findUnique({ where: { id: officeId } })
      : await fetchDefaultOffice();

  if (!officeRecord) {
    return NextResponse.json({ message: "Escritório não encontrado" }, { status: 400 });
  }

  if ([Role.GERENTE_NEGOCIOS, Role.PROPRIETARIO, Role.CONSULTOR].includes(role) && !officeId) {
    return NextResponse.json({ message: "Escritório é obrigatório para esse perfil" }, { status: 400 });
  }

  const targetOffice = officeRecord.office;

  let ownerConnect = undefined;
  if (role === Role.CONSULTOR) {
    if (sessionRole === Role.PROPRIETARIO) {
      if (sessionUser.role !== Role.PROPRIETARIO) {
        return NextResponse.json({ message: "Owner inválido" }, { status: 400 });
      }
      if (sessionUser.office !== targetOffice) {
        return NextResponse.json(
          { message: "Owner deve pertencer ao mesmo escritório" },
          { status: 400 }
        );
      }
      ownerConnect = { connect: { id: sessionUser.id } };
    } else {
      if (!ownerId) {
        return NextResponse.json({ message: "Consultor precisa de proprietário" }, { status: 400 });
      }
      const owner = await prisma.user.findUnique({ where: { id: ownerId } });
      if (!owner || owner.role !== Role.PROPRIETARIO) {
        return NextResponse.json({ message: "Proprietário inválido" }, { status: 400 });
      }
      if (owner.office !== targetOffice) {
        return NextResponse.json(
          { message: "Proprietário deve pertencer ao mesmo escritório" },
          { status: 400 }
        );
      }
      ownerConnect = { connect: { id: owner.id } };
    }
  }

  try {
    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashed,
        role,
        profile: role as Profile,
        office: officeRecord.office,
        officeRecord: { connect: { id: officeRecord.id } },
        ...(ownerConnect ? { owner: ownerConnect } : {}),
        active: true,
      },
      select: USER_SELECT,
    });
    return NextResponse.json(user, { status: 201 });
  } catch (error: unknown) {
    const code = (error as { code?: string })?.code;
    if (code === "P2002") {
      return NextResponse.json({ message: "Email já cadastrado" }, { status: 409 });
    }
    return NextResponse.json({ message: "Erro ao criar usuário" }, { status: 500 });
  }
}
