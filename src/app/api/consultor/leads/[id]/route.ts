export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LeadStatus, Role, Prisma } from "@prisma/client";

type Params = { params: { id: string } };

export async function PATCH(req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== Role.CONSULTOR) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { status, observacao } = await req.json();
  if (!status) return NextResponse.json({ message: "Status é obrigatório" }, { status: 400 });

  const allowed = Object.values(LeadStatus).includes(status);
  if (!allowed) return NextResponse.json({ message: "Status inválido" }, { status: 400 });

  const lead = await prisma.lead.findUnique({ where: { id: params.id } });
  if (!lead || lead.consultorId !== session.user.id) {
    return NextResponse.json({ message: "Lead não encontrado" }, { status: 404 });
  }

  const historicoAtual: Record<string, unknown>[] = Array.isArray(lead.historico)
    ? (lead.historico as Record<string, unknown>[])
    : [];
  historicoAtual.push({
    tipo: "ATUALIZACAO_CONSULTOR",
    status,
    observacao: observacao ?? null,
    em: new Date().toISOString(),
  });

  await prisma.lead.update({
    where: { id: params.id },
    data: {
      status,
      historico: historicoAtual as Prisma.JsonArray,
    },
  });

  return NextResponse.json({ ok: true });
}
