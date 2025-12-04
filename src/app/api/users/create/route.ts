import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { Office, Role, Profile } from "@prisma/client";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user.role !== Role.MASTER && session.user.role !== Role.PROPRIETARIO)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { name, email, password, role, profile, office, ownerId } = body;

  if (!name || !email || !password || (!role && !profile) || !office) {
    return NextResponse.json({ message: "Missing fields" }, { status: 400 });
  }

  if (role && !Object.values(Role).includes(role)) {
    return NextResponse.json({ message: "Invalid role" }, { status: 400 });
  }

  const officeEnum = Object.values(Office).find((e) => e === office);
  if (!officeEnum) {
    return NextResponse.json({ message: "Invalid office" }, { status: 400 });
  }

  const profileValue = (profile ?? role) as Profile | undefined;
  if (!profileValue || !Object.values(Profile).includes(profileValue)) {
    return NextResponse.json({ message: "Invalid profile" }, { status: 400 });
  }

  if (profileValue === Profile.CONSULTOR && !ownerId) {
    return NextResponse.json({ message: "Consultor precisa de proprietário" }, { status: 400 });
  }

  const officeRecord = await prisma.officeRecord.findUnique({ where: { office: officeEnum } });
  if (!officeRecord) {
    return NextResponse.json({ message: "Escritório não encontrado" }, { status: 400 });
  }

  const hashed = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      name,
      email,
      password: hashed,
      role: role ?? (profileValue as Role),
      profile: profileValue,
      office: officeEnum,
      officeRecord: {
        connect: {
          id: officeRecord.id,
        },
      },
      ...(profileValue === Profile.CONSULTOR ? { owner: { connect: { id: ownerId } } } : {}),
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
}
