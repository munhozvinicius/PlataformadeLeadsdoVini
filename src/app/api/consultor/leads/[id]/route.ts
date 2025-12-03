export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LeadStatus, Role, Prisma } from "@prisma/client";
import { getOwnerTeamIds } from "@/lib/auth-helpers";

type Params = { params: { id: string } };

export async function PATCH(req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { status, observacao } = await req.json();
  if (!status) return NextResponse.json({ message: "Status é obrigatório" }, { status: 400 });

  const allowed = Object.values(LeadStatus).includes(status);
  if (!allowed) return NextResponse.json({ message: "Status inválido" }, { status: 400 });

  let leadWhere: Prisma.LeadWhereInput = { id: params.id };
  if (session.user.role === Role.CONSULTOR) {
    leadWhere.consultorId = session.user.id;
  } else if (session.user.role === Role.OWNER) {
    const allowedIds = await getOwnerTeamIds(session.user.id);
    leadWhere.consultorId = { in: allowedIds };
  }

  const lead = await prisma.lead.findFirst({ where: leadWhere });
  if (!lead) {
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
      isWorked: true,
      lastStatusChangeAt: new Date(),
      historico: historicoAtual as Prisma.JsonArray,
      lastActivityAt: new Date(),
      lastInteractionAt: new Date(),
      interactionCount: (lead.interactionCount ?? 0) + 1,
      nextFollowUpAt: lead.nextFollowUpAt ?? null,
      nextStepNote: lead.nextStepNote ?? null,
      lastOutcomeNote: observacao ?? lead.lastOutcomeNote ?? null,
    },
  });

  return NextResponse.json({ ok: true });
}
      historico: historicoAtual as Prisma.JsonArray,
    },
  });

  return NextResponse.json({ ok: true });
}
