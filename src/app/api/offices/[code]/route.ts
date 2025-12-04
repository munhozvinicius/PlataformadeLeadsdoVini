export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PrismaClient, Role } from "@prisma/client";

const prisma = new PrismaClient();

function isMaster(role?: Role) {
  return role === Role.MASTER;
}

export async function PATCH(req: Request, { params }: { params: { code: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isMaster(session.user.role)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as { name?: string };
  const name = (body.name ?? "").toString().trim();
  if (!name) {
    return NextResponse.json({ message: "Nome do escritório é obrigatório" }, { status: 400 });
  }

  try {
    const office = await prisma.officeRecord.update({
      where: { code: params.code },
      data: { name },
      select: { id: true, code: true, name: true, createdAt: true },
    });
    return NextResponse.json(office);
  } catch (error) {
    if ((error as { code?: string }).code === "P2025") {
      return NextResponse.json({ message: "Escritório não encontrado" }, { status: 404 });
    }
    console.error("PATCH /api/offices/[code]", error);
    return NextResponse.json({ message: "Erro ao atualizar escritório" }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { code: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isMaster(session.user.role)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const office = await prisma.officeRecord.findUnique({
    where: { code: params.code },
    select: { id: true },
  });
  if (!office) {
    return NextResponse.json({ message: "Escritório não encontrado" }, { status: 404 });
  }
  const usage = await prisma.user.count({ where: { officeId: office.id } });
  if (usage > 0) {
    return NextResponse.json(
      { message: "Não é possível excluir um escritório com usuários vinculados" },
      { status: 409 }
    );
  }

  try {
    await prisma.officeRecord.delete({ where: { code: params.code } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if ((error as { code?: string }).code === "P2025") {
      return NextResponse.json({ message: "Escritório não encontrado" }, { status: 404 });
    }
    console.error("DELETE /api/offices/[code]", error);
    return NextResponse.json({ message: "Erro ao excluir escritório" }, { status: 500 });
  }
}
