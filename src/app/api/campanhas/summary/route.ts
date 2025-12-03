import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LeadStatus, Role } from "@prisma/client";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role === Role.CONSULTOR) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const campanhas = await prisma.campanha.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, nome: true, descricao: true, createdAt: true },
  });

  const result = [];
  for (const camp of campanhas) {
    const totalBruto = await prisma.lead.count({ where: { campanhaId: camp.id } });
    const atribuidos = await prisma.lead.count({
      where: { campanhaId: camp.id, consultorId: { not: null } },
    });
    const restantes = await prisma.lead.count({
      where: { campanhaId: camp.id, consultorId: null },
    });
    const consultores = await prisma.lead.groupBy({
      by: ["consultorId"],
      where: { campanhaId: camp.id, consultorId: { not: null } },
      _count: { consultorId: true },
    });
    result.push({
      ...camp,
      totalBruto,
      atribuidos,
      restantes,
      consultoresReceberam: consultores.length,
    });
  }

  return NextResponse.json(result);
}
