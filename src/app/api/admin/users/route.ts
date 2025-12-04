export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Escritorio, Role } from "@prisma/client";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const userSelect = {
    id: true,
    name: true,
    email: true,
    role: true,
    escritorio: true,
    isBlocked: true,
    owner: { select: { id: true, name: true, email: true, escritorio: true } },
    office: { select: { id: true, name: true, code: true } },
  };

  const role = session.user.role as Role;
  let users;

  if (role === Role.MASTER) {
    users = await prisma.user.findMany({
      select: userSelect,
      orderBy: { createdAt: "desc" },
    });
  } else if (role === Role.PROPRIETARIO) {
    // Proprietário vê a si mesmo e consultores vinculados
    users = await prisma.user.findMany({
      where: {
        OR: [{ id: session.user.id }, { ownerId: session.user.id }],
      },
      select: userSelect,
      orderBy: { createdAt: "desc" },
    });
  } else {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(users);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { name, email, password, role, ownerId, escritorio } = body;

  const sessionRole = session.user.role as Role;

  if (!name || !email || !password || !role || !escritorio) {
    return NextResponse.json({ message: "Missing fields" }, { status: 400 });
  }

  if (role !== Role.PROPRIETARIO && role !== Role.CONSULTOR) {
    return NextResponse.json({ message: "Invalid role" }, { status: 400 });
  }

  const escritorioEnum = Object.values(Escritorio).find((e) => e === escritorio);
  if (!escritorioEnum) {
    return NextResponse.json({ message: "Invalid escritorio" }, { status: 400 });
  }

  // Dono só cria consultor do próprio escritório
  if (sessionRole === Role.PROPRIETARIO && role === Role.CONSULTOR) {
    const owner = await prisma.user.findUnique({ where: { id: session.user.id } });
      if (!owner) return NextResponse.json({ message: "Proprietário inválido" }, { status: 400 });
      if (owner.escritorio !== escritorioEnum) {
        return NextResponse.json(
          { message: "Proprietário só cria consultor do próprio escritório" },
          { status: 400 }
        );
      }
    const hashed = await bcrypt.hash(password, 10);
    try {
      const user = await prisma.user.create({
        data: {
          name,
          email,
          passwordHash: hashed,
          role,
          escritorio: owner.escritorio,
          ownerId: owner.id,
        },
      });
      return NextResponse.json(
        { id: user.id, name: user.name, email: user.email, role: user.role },
        { status: 201 }
      );
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === "P2002") {
        return NextResponse.json({ message: "Email já cadastrado" }, { status: 409 });
      }
      return NextResponse.json({ message: "Erro ao criar usuário" }, { status: 500 });
    }
  }

  if (sessionRole === Role.PROPRIETARIO && role !== Role.CONSULTOR) {
    return NextResponse.json({ message: "Proprietário só cria consultor" }, { status: 401 });
  }

  if (role === Role.CONSULTOR && !ownerId && sessionRole === Role.MASTER) {
    return NextResponse.json({ message: "Consultor precisa de um PROPRIETÁRIO" }, { status: 400 });
  }

  const hashed = await bcrypt.hash(password, 10);

  try {
    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash: hashed,
        role,
        escritorio: escritorioEnum,
        ownerId: role === Role.CONSULTOR ? ownerId : null,
      },
    });

    return NextResponse.json(
      { id: user.id, name: user.name, email: user.email, role: user.role },
      { status: 201 }
    );
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === "P2002") {
      return NextResponse.json({ message: "Email já cadastrado" }, { status: 409 });
    }
    return NextResponse.json({ message: "Erro ao criar usuário" }, { status: 500 });
  }
}
