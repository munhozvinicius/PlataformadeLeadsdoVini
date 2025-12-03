export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role, LeadStatus } from "@prisma/client";

type Params = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role === Role.CONSULTOR) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const id = params.id;
  const campaign = await prisma.campanha.findUnique({ where: { id } });
  if (!campaign) return NextResponse.json({ message: "Campanha não encontrada" }, { status: 404 });

  const [total, atribuidos, estoque, ganhos, perdidos] = await Promise.all([
    prisma.lead.count({ where: { campanhaId: id } }),
    prisma.lead.count({ where: { campanhaId: id, consultorId: { not: null } } }),
    prisma.lead.count({ where: { campanhaId: id, consultorId: null } }),
    prisma.lead.count({ where: { campanhaId: id, status: LeadStatus.FECHADO } }),
    prisma.lead.count({ where: { campanhaId: id, status: LeadStatus.PERDIDO } }),
  ]);

  const topMotivosPerda = await prisma.leadActivity.groupBy({
    by: ["outcomeLabel"],
    _count: { outcomeLabel: true },
    where: { lead: { campanhaId: id, status: LeadStatus.PERDIDO } },
    orderBy: { _count: { outcomeLabel: "desc" } },
    take: 5,
  });

  return NextResponse.json({
    campaign,
    resumo: { total, atribuidos, estoque, ganhos, perdidos },
    topMotivosPerda: topMotivosPerda.map((m) => ({ label: m.outcomeLabel, count: m._count.outcomeLabel })),
  });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== Role.MASTER) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const { status, nome, descricao } = await req.json();
  const data: { nome?: string; descricao?: string; isActive?: boolean } = {};
  if (nome !== undefined) data.nome = nome;
  if (descricao !== undefined) data.descricao = descricao;
  if (status) data.isActive = status === "PAUSADA" || status === "ENCERRADA" ? false : true;
  const updated = await prisma.campanha.update({ where: { id: params.id }, data });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== Role.MASTER) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  await prisma.campanha.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
