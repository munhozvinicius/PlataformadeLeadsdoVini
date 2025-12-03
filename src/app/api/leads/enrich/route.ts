export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

// Beta: coleta leve simulada; em produção, substituir por chamadas reais de APIs públicas.
async function fakeEnrichment(documento?: string | null) {
  const now = new Date().toISOString();
  return {
    fonte: "beta-enrichment",
    coletadoEm: now,
    website: "https://empresa-exemplo.com",
    telefoneGoogle: "+55 11 4002-8922",
    whatsapp: "+55 11 98888-7777",
    funcionariosLinkedIn: 120,
    socios: documento ? [{ nome: "Sócio Exemplo", documento }] : [],
    emailsPublicos: ["contato@empresa-exemplo.com"],
    redesSociais: ["https://linkedin.com/company/empresa-exemplo"],
  };
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const leadId = req.nextUrl.searchParams.get("id");
  if (!leadId) return NextResponse.json({ message: "id é obrigatório" }, { status: 400 });

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return NextResponse.json({ message: "Lead não encontrado" }, { status: 404 });

  // Permissão básica
  if (session.user.role === Role.CONSULTOR && lead.consultorId !== session.user.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const enriched = await fakeEnrichment(lead.documento ?? lead.cnpj);

  await prisma.lead.update({
    where: { id: leadId },
    data: {
      externalData: enriched,
      site: enriched.website ?? lead.site ?? undefined,
      lastActivityAt: new Date(),
      lastInteractionAt: new Date(),
    },
  });

  await prisma.leadActivity.create({
    data: {
      leadId,
      userId: session.user.id,
      campaignId: lead.campanhaId,
      activityType: "DADOS_ENRIQUECIDOS",
      note: `Dados enriquecidos (beta): ${JSON.stringify(enriched)}`,
      stageBefore: lead.status,
      stageAfter: lead.status,
    },
  });

  return NextResponse.json(enriched, { status: 200 });
}
