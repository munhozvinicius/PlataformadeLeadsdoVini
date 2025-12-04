import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { Office, Role } from "@prisma/client";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user.role !== Role.MASTER && session.user.role !== Role.PROPRIETARIO)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { name, email, password, role, office, ownerId } = body;

  if (!name || !email || !password || !role || !office) {
    return NextResponse.json({ message: "Missing fields" }, { status: 400 });
  }

  if (!Object.values(Role).includes(role)) {
    return NextResponse.json({ message: "Invalid role" }, { status: 400 });
  }

  const officeEnum = Object.values(Office).find((e) => e === office);
  if (!officeEnum) {
    return NextResponse.json({ message: "Invalid office" }, { status: 400 });
  }

  if (role === Role.CONSULTOR && !ownerId) {
    return NextResponse.json({ message: "Consultor precisa de proprietário" }, { status: 400 });
  }

  const officeRecord = await prisma.officeRecord.findUnique({ where: { code: officeEnum } });
  if (!officeRecord) {
    return NextResponse.json({ message: "Escritório não encontrado" }, { status: 400 });
  }

  const hashed = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      name,
      email,
      password: hashed,
      role,
      office: {
        connect: {
          id: officeRecord.id,
        },
      },
      ownerId: role === Role.CONSULTOR ? ownerId : null,
    },
  });

  return NextResponse.json({ id: user.id, email: user.email, role: user.role }, { status: 201 });
}
