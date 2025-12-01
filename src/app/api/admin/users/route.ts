export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Escritorio, Role } from "@prisma/client";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== Role.MASTER) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const users = await prisma.user.findMany({
    include: { owner: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(users);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== Role.MASTER) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { name, email, password, role, ownerId, escritorio } = body;

  if (!name || !email || !password || !role || !escritorio) {
    return NextResponse.json({ message: "Missing fields" }, { status: 400 });
  }

  if (role !== Role.OWNER && role !== Role.CONSULTOR) {
    return NextResponse.json({ message: "Invalid role" }, { status: 400 });
  }

  const escritorioEnum = Object.values(Escritorio).find((e) => e === escritorio);
  if (!escritorioEnum) {
    return NextResponse.json({ message: "Invalid escritorio" }, { status: 400 });
  }

  if (role === Role.CONSULTOR && !ownerId) {
    return NextResponse.json({ message: "Consultor precisa de um OWNER" }, { status: 400 });
  }

  const hashed = await bcrypt.hash(password, 10);

  try {
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashed,
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
