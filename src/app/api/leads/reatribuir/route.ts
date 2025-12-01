export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LeadStatus, Role } from "@prisma/client";

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role === Role.CONSULTOR) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { leadId, novoConsultorId, observacao } = await req.json();
  if (!leadId || !novoConsultorId) {
    return NextResponse.json({ message: "Dados inválidos" }, { status: 400 });
  }

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return NextResponse.json({ message: "Lead não encontrado" }, { status: 404 });

  const historicoAtual: Record<string, unknown>[] = Array.isArray(lead.historico)
    ? (lead.historico as Record<string, unknown>[])
    : [];
  historicoAtual.push({
    tipo: "REATRIBUICAO",
    de: lead.consultorId ?? null,
    para: novoConsultorId,
    observacao: observacao ?? null,
    em: new Date().toISOString(),
  });

  await prisma.lead.update({
    where: { id: leadId },
    data: {
      consultorId: novoConsultorId,
      status: LeadStatus.EM_ATENDIMENTO,
      historico: historicoAtual,
    },
  });

  return NextResponse.json({ ok: true });
}
