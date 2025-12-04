import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { Escritorio, Role } from "@prisma/client";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user.role !== Role.MASTER && session.user.role !== Role.PROPRIETARIO)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { name, email, password, role, escritorio, ownerId } = body;

  if (!name || !email || !password || !role || !escritorio) {
    return NextResponse.json({ message: "Missing fields" }, { status: 400 });
  }

  if (!Object.values(Role).includes(role)) {
    return NextResponse.json({ message: "Invalid role" }, { status: 400 });
  }

  const escritorioEnum = Object.values(Escritorio).find((e) => e === escritorio);
  if (!escritorioEnum) {
    return NextResponse.json({ message: "Invalid escritorio" }, { status: 400 });
  }

  if (role === Role.CONSULTOR && !ownerId) {
    return NextResponse.json({ message: "Consultor precisa de proprietário" }, { status: 400 });
  }

  const hashed = await bcrypt.hash(password, 10);
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

  return NextResponse.json({ id: user.id, email: user.email, role: user.role }, { status: 201 });
}
