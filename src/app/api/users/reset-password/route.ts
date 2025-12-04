export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const password = typeof body.password === "string" ? body.password.trim() : "";
  if (!password || password.length < 8) {
    return NextResponse.json(
      { message: "Senha inválida. Informe ao menos 8 caracteres." },
      { status: 400 }
    );
  }

  const hashed = await bcrypt.hash(password, 10);
  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      password: hashed,
      mustResetPassword: false,
      isBlocked: false,
    },
  });

  return NextResponse.json({ ok: true });
}
