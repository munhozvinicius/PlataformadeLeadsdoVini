export const dynamic = "force-dynamic";

import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Office, Role, Profile, Prisma } from "@prisma/client";
import { canManageUsers, isProprietario } from "@/lib/authRoles";
import {
  assignUserOffices,
  buildUsersFilter,
  getUserOfficeCodes,
  normalizeOfficeCodes,
} from "@/lib/userOffice";

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  profile: true,
  office: true,
  officeRecord: { select: { id: true } },
  owner: { select: { id: true, name: true, email: true } },
  senior: { select: { id: true, name: true } },
  offices: { select: { office: true } },
  active: true,
};

const CREATOR_ROLES = [
  Role.MASTER,
  Role.GERENTE_SENIOR,
  Role.GERENTE_NEGOCIOS,
  Role.PROPRIETARIO,
];

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const currentRole = session.user.role;
  if (!currentRole) {
    return NextResponse.json({ message: "Sessão inválida" }, { status: 401 });
  }
  if (!canManageUsers(currentRole)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const sessionUser = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!sessionUser) {
    return NextResponse.json({ message: "Sessão inválida" }, { status: 401 });
  }

  if (currentRole === Role.CONSULTOR) {
    return NextResponse.json({ message: "Acesso proibido" }, { status: 403 });
  }

  const where = await buildUsersFilter(currentRole, session.user.id);

  const users = await prisma.user.findMany({
    where,
    include: {
      owner: true,
      senior: true,
      offices: { select: { office: true } },
    },
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
  if (!sessionRole) {
    return NextResponse.json({ message: "Sessão inválida" }, { status: 401 });
  }
  if (!canManageUsers(sessionRole)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (sessionRole === Role.CONSULTOR) {
    return NextResponse.json({ message: "Consultores não podem criar usuários" }, { status: 403 });
  }

  const body = await req.json();
  const { name, email, password, role, officeIds, ownerId, seniorId, active } = body;

  if (!name || !email || !password || !role) {
    return NextResponse.json({ message: "Dados insuficientes" }, { status: 400 });
  }

  if (!Object.values(Role).includes(role)) {
    return NextResponse.json({ message: "Perfil inválido" }, { status: 400 });
  }

  if (!CREATOR_ROLES.includes(sessionRole)) {
    return NextResponse.json({ message: "Você não pode criar esse tipo de usuário" }, { status: 403 });
  }

  if (isProprietario(sessionRole) && role !== Role.CONSULTOR) {
    return NextResponse.json({ message: "Proprietário só pode criar consultores" }, { status: 403 });
  }

  const normalizedOffices = normalizeOfficeCodes(officeIds);
  let ownerConnect;
  if (role === Role.CONSULTOR) {
    const targetOwnerId = ownerId ?? (isProprietario(sessionRole) ? session.user.id : null);
    if (!targetOwnerId) {
      return NextResponse.json({ message: "Consultor precisa de proprietário" }, { status: 400 });
    }
    const owner = await prisma.user.findUnique({ where: { id: targetOwnerId } });
    if (!owner || owner.role !== Role.PROPRIETARIO) {
      return NextResponse.json({ message: "Proprietário inválido" }, { status: 400 });
    }
    ownerConnect = { connect: { id: owner.id } };
  }

  const seniorConnect =
    role === Role.GERENTE_NEGOCIOS
      ? sessionRole === Role.GERENTE_SENIOR
        ? { connect: { id: session.user.id } }
        : seniorId
        ? { connect: { id: seniorId } }
        : undefined
      : undefined;

  try {
    const hashed = await bcrypt.hash(password, 10);
    const targetOffices: Office[] = [];
    if (role === Role.GERENTE_SENIOR) {
      targetOffices.push(...(Object.values(Office) as Office[]));
    } else if (role === Role.GERENTE_NEGOCIOS) {
      if (!normalizedOffices.length) {
        return NextResponse.json({ message: "GERENTE_NEGOCIOS precisa de ao menos um escritório" }, { status: 400 });
      }
      targetOffices.push(...normalizedOffices);
    } else if (role === Role.PROPRIETARIO) {
      if (!normalizedOffices.length) {
        return NextResponse.json({ message: "PROPRIETARIO precisa de um escritório" }, { status: 400 });
      }
      targetOffices.push(normalizedOffices[0]);
    } else if (role === Role.CONSULTOR) {
      if (!ownerConnect) {
        return NextResponse.json({ message: "Proprietário inválido" }, { status: 400 });
      }
      const ownerIdValue = (ownerConnect.connect as { id: string }).id;
      const ownerOffices = await getUserOfficeCodes(ownerIdValue);
      if (!ownerOffices.length) {
        return NextResponse.json({ message: "Proprietário sem escritório" }, { status: 400 });
      }
      targetOffices.push(...ownerOffices);
    }

    const userData: Prisma.UserCreateInput = {
      name,
      email,
      password: hashed,
      role,
      profile: role as Profile,
      office: targetOffices[0] ?? Office.SAFE_TI,
      ...(ownerConnect ? { owner: ownerConnect } : {}),
      ...(seniorConnect ? { senior: seniorConnect } : {}),
      active: typeof active === "boolean" ? active : true,
    };
    const user = await prisma.user.create({
      data: userData,
      select: USER_SELECT,
    });

    await assignUserOffices(user.id, targetOffices);

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
