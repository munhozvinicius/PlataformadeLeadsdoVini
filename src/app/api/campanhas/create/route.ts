import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role === Role.CONSULTOR) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { nome, descricao } = await req.json();
  if (!nome) return NextResponse.json({ message: "Nome obrigatório" }, { status: 400 });

  const campanha = await prisma.campanha.create({
    data: {
      nome,
      descricao,
    },
  });

  return NextResponse.json(campanha, { status: 201 });
}
