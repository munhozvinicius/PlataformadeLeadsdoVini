export const dynamic = "force-dynamic";

import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Office, Role, Profile, Prisma } from "@prisma/client";
import { canManageUsers, isMaster, isProprietario } from "@/lib/authRoles";

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

const ALL_ROLES = Object.values(Role) as Role[];

const ALLOWED_CREATION: Record<Role, Role[]> = {
  [Role.MASTER]: ALL_ROLES,
  [Role.GERENTE_SENIOR]: [Role.GERENTE_NEGOCIOS, Role.PROPRIETARIO, Role.CONSULTOR],
  [Role.GERENTE_NEGOCIOS]: [Role.PROPRIETARIO, Role.CONSULTOR],
  [Role.PROPRIETARIO]: [Role.CONSULTOR],
  [Role.CONSULTOR]: [],
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

  const currentRole = session.user.role;
  if (!canManageUsers(currentRole)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const sessionUser = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!sessionUser) {
    return NextResponse.json({ message: "Sessão inválida" }, { status: 401 });
  }

  const officeScope: Prisma.UserWhereInput | undefined =
    currentRole === Role.MASTER || !sessionUser.officeId
      ? undefined
      : { officeId: sessionUser.officeId };

  const where = officeScope;

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

  const sessionRole = session.user.role;
  const creatorRole = sessionRole as Role;
  if (!canManageUsers(sessionRole)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { name, email, password, role, officeId, ownerId } = body;

  if (!name || !email || !password || !role) {
    return NextResponse.json({ message: "Dados insuficientes" }, { status: 400 });
  }

  if (!Object.values(Role).includes(role)) {
    return NextResponse.json({ message: "Perfil inválido" }, { status: 400 });
  }

  const requiresOffice = [
    Role.PROPRIETARIO,
    Role.CONSULTOR,
    Role.GERENTE_NEGOCIOS,
    Role.GERENTE_SENIOR,
  ].includes(role);
  const requiresOwner = role === Role.CONSULTOR;

  const sessionUser = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!sessionUser) {
    return NextResponse.json({ message: "Sessão inválida" }, { status: 401 });
  }

  const allowedRoles = ALLOWED_CREATION[creatorRole];
  if (!allowedRoles.includes(role)) {
    return NextResponse.json({ message: "Você não pode criar esse tipo de usuário" }, { status: 403 });
  }

  if (isProprietario(sessionRole) && role !== Role.CONSULTOR) {
    return NextResponse.json({ message: "Proprietário só pode criar consultores" }, { status: 403 });
  }

  const sessionOfficeId = sessionUser.officeId;
  let officeRecord = null;
  if (!isMaster(sessionRole) && sessionOfficeId) {
    officeRecord = await prisma.officeRecord.findUnique({ where: { id: sessionOfficeId } });
  } else if (requiresOffice && officeId) {
    officeRecord = await prisma.officeRecord.findUnique({ where: { id: officeId } });
  } else if (requiresOffice) {
    return NextResponse.json({ message: "Escritório é obrigatório para este perfil" }, { status: 400 });
  } else {
    officeRecord = await fetchDefaultOffice();
  }

  if (!officeRecord) {
    return NextResponse.json({ message: "Escritório não encontrado" }, { status: 400 });
  }

  if (!isMaster(sessionRole) && sessionOfficeId && officeRecord.id !== sessionOfficeId) {
    return NextResponse.json({ message: "Você só pode criar usuários do seu escritório" }, { status: 403 });
  }

  let ownerConnect;
  if (requiresOwner) {
    if (isProprietario(sessionRole)) {
      ownerConnect = { connect: { id: session.user.id } };
    } else {
      if (!ownerId) {
        return NextResponse.json({ message: "Consultor precisa de proprietário" }, { status: 400 });
      }
      const owner = await prisma.user.findUnique({ where: { id: ownerId } });
      if (!owner || owner.role !== Role.PROPRIETARIO) {
        return NextResponse.json({ message: "Proprietário inválido" }, { status: 400 });
      }
      if (owner.office !== officeRecord.office) {
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
    const userData: Prisma.UserCreateInput = {
      name,
      email,
      password: hashed,
      role,
      profile: role as Profile,
      office: officeRecord.office,
      officeRecord: { connect: { id: officeRecord.id } },
      ...(ownerConnect ? { owner: ownerConnect } : {}),
      active: true,
    };
    const user = await prisma.user.create({
      data: userData,
      select: USER_SELECT,
    });
    return NextResponse.json(user, { status: 201 });
  } catch (error: unknown) {
    console.error("Error in /api/admin/users POST:", error);
    const code = (error as { code?: string })?.code;
    if (code === "P2002") {
      return NextResponse.json({ message: "Email já cadastrado" }, { status: 409 });
    }
    return NextResponse.json({ message: "Erro ao criar usuário" }, { status: 500 });
  }
}
