export const dynamic = "force-dynamic";

import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Office, Role, Profile } from "@prisma/client";
import { canManageUsers, isProprietario } from "@/lib/authRoles";

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

  const currentRole = session.user.role;
  if (!canManageUsers(currentRole)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const where =
    isProprietario(currentRole)
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

  const sessionRole = session.user.role;
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

  const requiresOffice = [Role.PROPRIETARIO, Role.CONSULTOR, Role.GERENTE_NEGOCIOS].includes(role);
  const requiresOwner = role === Role.CONSULTOR;

  const sessionUser = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!sessionUser) {
    return NextResponse.json({ message: "Sessão inválida" }, { status: 401 });
  }

  if (isProprietario(sessionRole) && role !== Role.CONSULTOR) {
    return NextResponse.json({ message: "Proprietário só pode criar consultores" }, { status: 403 });
  }

  let officeRecord =
    requiresOffice && isProprietario(sessionRole) && sessionUser.officeId
      ? await prisma.officeRecord.findUnique({ where: { id: sessionUser.officeId } })
      : requiresOffice && officeId
      ? await prisma.officeRecord.findUnique({ where: { id: officeId } })
      : await fetchDefaultOffice();

  if (!officeRecord) {
    return NextResponse.json({ message: "Escritório não encontrado" }, { status: 400 });
  }

  if (requiresOffice && !officeRecord) {
    return NextResponse.json({ message: "Escritório obrigatório" }, { status: 400 });
  }

  if (isProprietario(sessionRole) && sessionUser.officeId && officeRecord.id !== sessionUser.officeId) {
    officeRecord = await prisma.officeRecord.findUnique({ where: { id: sessionUser.officeId } });
  }

  if (!officeRecord) {
    return NextResponse.json({ message: "Escritório do proprietário inválido" }, { status: 400 });
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

  if (requiresOffice && !officeId && !isProprietario(sessionRole)) {
    return NextResponse.json({ message: "Escritório é obrigatório" }, { status: 400 });
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
