import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role, LeadStatus } from "@prisma/client";

type Params = { params: { id: string } };

export async function GET(_req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role === Role.CONSULTOR) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const campanhaId = params.id;

  const totalBruto = await prisma.lead.count({ where: { campanhaId } });
  const atribuidos = await prisma.lead.count({
    where: { campanhaId, status: { in: [LeadStatus.EM_ATENDIMENTO, LeadStatus.FINALIZADO] } },
  });
  const restantes = await prisma.lead.count({ where: { campanhaId, status: LeadStatus.NOVO } });

  const byStatus = await prisma.lead.groupBy({
    by: ["status"],
    where: { campanhaId },
    _count: { status: true },
  });

  return NextResponse.json({
    totalBruto: totalBruto ?? 0,
    atribuidos: atribuidos ?? 0,
    restantes: restantes ?? 0,
    byStatus: byStatus.map((b) => ({ status: b.status, count: b._count.status })),
  });
}
