export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LeadStatus, Role } from "@prisma/client";

type ConsultantPerf = {
  id: string;
  nome: string | null;
  email: string | null;
  escritorio: string | null;
  recebidos: number;
  trabalhados: number;
  ganhos: number;
  perdidos: number;
  taxaConversao: number;
  leadsParados72h: number;
  tempoMedioPrimeiroContato: number;
  tempoMedioConclusao: number;
};

type CampaignPerf = {
  id: string;
  nome: string | null;
  totalBase: number;
  atribuidos: number;
  estoque: number;
  trabalhados: number;
  ganhos: number;
  perdidos: number;
  taxaConversao: number;
  topMotivosPerda: { motivo: string | null; count: number }[];
  tempoMedio1Contato: number;
  tempoMedioConclusao: number;
};

function avg(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== Role.MASTER) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);
  const startWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const cutoff72h = new Date(now.getTime() - 72 * 60 * 60 * 1000);

  // KPIs gerais
  const [totalLeads, leadsAtivos, leadsEmTratativa, leadsGanhos, leadsPerdidos, leadsImportadosHoje, leadsImportadosSemana] =
    await Promise.all([
      prisma.lead.count(),
      prisma.lead.count({ where: { status: { in: [LeadStatus.NOVO, LeadStatus.EM_CONTATO] } } }),
      prisma.lead.count({ where: { status: { in: [LeadStatus.EM_CONTATO, LeadStatus.EM_NEGOCIACAO] } } }),
      prisma.lead.count({ where: { status: LeadStatus.FECHADO } }),
      prisma.lead.count({ where: { status: LeadStatus.PERDIDO } }),
      prisma.lead.count({ where: { createdAt: { gte: startToday } } }),
      prisma.lead.count({ where: { createdAt: { gte: startWeek } } }),
    ]);
  const taxaConversaoGeral = totalLeads > 0 ? leadsGanhos / totalLeads : 0;

  // Performance por consultor
  const consultants = await prisma.user.findMany({
    where: { role: Role.CONSULTOR },
    select: { id: true, name: true, email: true, office: true },
  });

  const performanceConsultores: ConsultantPerf[] = [];
  for (const c of consultants) {
    const recebidos = await prisma.lead.count({ where: { consultorId: c.id } });
    const trabalhados = await prisma.lead.count({
      where: { consultorId: c.id, status: { not: LeadStatus.NOVO } },
    });
    const ganhos = await prisma.lead.count({ where: { consultorId: c.id, status: LeadStatus.FECHADO } });
    const perdidos = await prisma.lead.count({ where: { consultorId: c.id, status: LeadStatus.PERDIDO } });
    const leadsParados72h = await prisma.lead.count({
      where: {
        consultorId: c.id,
        status: { in: [LeadStatus.NOVO, LeadStatus.EM_CONTATO, LeadStatus.EM_NEGOCIACAO] },
        OR: [
          { lastActivityAt: { lt: cutoff72h } },
          { lastActivityAt: null, createdAt: { lt: cutoff72h } },
        ],
      },
    });

    // Tempo médio até 1º contato
    const firstActivities = await prisma.leadActivity.findMany({
      where: { lead: { consultorId: c.id } },
      orderBy: { createdAt: "asc" },
      select: { leadId: true, createdAt: true },
    });
    const firstByLead = new Map<string, Date>();
    firstActivities.forEach((a) => {
      if (!firstByLead.has(a.leadId)) firstByLead.set(a.leadId, a.createdAt);
    });
    let tempoMedioPrimeiroContato = 0;
    if (firstByLead.size > 0) {
      const leadIds = Array.from(firstByLead.keys());
      const leadsBase = await prisma.lead.findMany({
        where: { id: { in: leadIds } },
        select: { id: true, createdAt: true },
      });
      const mapLeadCreated = new Map(leadsBase.map((l) => [l.id, l.createdAt]));
      const diffs = leadIds
        .map((id) => {
          const created = mapLeadCreated.get(id);
          const first = firstByLead.get(id);
          if (!created || !first) return 0;
          return first.getTime() - created.getTime();
        })
        .filter((v) => v > 0);
      tempoMedioPrimeiroContato = avg(diffs);
    }

    // Tempo médio conclusão (ganho ou perda)
    const concluídos = await prisma.lead.findMany({
      where: { consultorId: c.id, status: { in: [LeadStatus.FECHADO, LeadStatus.PERDIDO] } },
      select: { createdAt: true, updatedAt: true },
    });
    const tempoMedioConclusao = avg(
      concluídos.map((l) => l.updatedAt.getTime() - l.createdAt.getTime()).filter((v) => v >= 0),
    );

    performanceConsultores.push({
      id: c.id,
      nome: c.name,
      email: c.email,
      escritorio: c.office ?? null,
      recebidos,
      trabalhados,
      ganhos,
      perdidos,
      taxaConversao: recebidos > 0 ? ganhos / recebidos : 0,
      leadsParados72h,
      tempoMedioPrimeiroContato,
      tempoMedioConclusao,
    });
  }

  // Campanhas
  const campaigns = await prisma.campanha.findMany({ select: { id: true, nome: true } });
  const campanhasPerf: CampaignPerf[] = [];
  for (const camp of campaigns) {
    const baseWhere = { campanhaId: camp.id };
    const [totalBase, atribuidos, estoque, trabalhados, ganhos, perdidos] = await Promise.all([
      prisma.lead.count({ where: baseWhere }),
      prisma.lead.count({ where: { ...baseWhere, consultorId: { not: null } } }),
      prisma.lead.count({ where: { ...baseWhere, consultorId: null } }),
      prisma.lead.count({ where: { ...baseWhere, status: { not: LeadStatus.NOVO } } }),
      prisma.lead.count({ where: { ...baseWhere, status: LeadStatus.FECHADO } }),
      prisma.lead.count({ where: { ...baseWhere, status: LeadStatus.PERDIDO } }),
    ]);
    const topMotivosPerdaRaw = await prisma.leadActivity.groupBy({
      by: ["outcomeLabel"],
      _count: { outcomeLabel: true },
      where: { lead: { campanhaId: camp.id, status: LeadStatus.PERDIDO } },
      orderBy: { _count: { outcomeLabel: "desc" } },
      take: 5,
    });
    const topMotivosPerda = topMotivosPerdaRaw.map((m) => ({
      motivo: m.outcomeLabel,
      count: m._count.outcomeLabel,
    }));

    // tempos
    const firstActivitiesCamp = await prisma.leadActivity.findMany({
      where: { lead: { campanhaId: camp.id } },
      orderBy: { createdAt: "asc" },
      select: { leadId: true, createdAt: true },
    });
    const firstCampMap = new Map<string, Date>();
    firstActivitiesCamp.forEach((a) => {
      if (!firstCampMap.has(a.leadId)) firstCampMap.set(a.leadId, a.createdAt);
    });
    const leadIdsCamp = Array.from(firstCampMap.keys());
    const leadsCampBase = await prisma.lead.findMany({
      where: { id: { in: leadIdsCamp } },
      select: { id: true, createdAt: true },
    });
    const createdCampMap = new Map(leadsCampBase.map((l) => [l.id, l.createdAt]));
    const tempoMedio1Contato = avg(
      leadIdsCamp
        .map((id) => {
          const cCreated = createdCampMap.get(id);
          const first = firstCampMap.get(id);
          if (!cCreated || !first) return 0;
          return first.getTime() - cCreated.getTime();
        })
        .filter((v) => v > 0),
    );
    const concluCamp = await prisma.lead.findMany({
      where: { campanhaId: camp.id, status: { in: [LeadStatus.FECHADO, LeadStatus.PERDIDO] } },
      select: { createdAt: true, updatedAt: true },
    });
    const tempoMedioConclusao = avg(
      concluCamp.map((l) => l.updatedAt.getTime() - l.createdAt.getTime()).filter((v) => v >= 0),
    );

    campanhasPerf.push({
      id: camp.id,
      nome: camp.nome,
      totalBase,
      atribuidos,
      estoque,
      trabalhados,
      ganhos,
      perdidos,
      taxaConversao: totalBase > 0 ? ganhos / totalBase : 0,
      topMotivosPerda,
      tempoMedio1Contato,
      tempoMedioConclusao,
    });
  }

  // Heatmap de motivos de perda (global)
  const heatmapGlobal = await prisma.leadActivity.groupBy({
    by: ["outcomeLabel"],
    _count: { outcomeLabel: true },
    orderBy: { _count: { outcomeLabel: "desc" } },
    take: 5,
  });

  // Saúde da base
  const leadsAll = await prisma.lead.findMany({
    select: { documento: true, cnpj: true, cidade: true, estado: true, telefone1: true, telefone2: true, telefone3: true, status: true },
  });
  const phoneRegex = /^\+?\d{8,15}$/;
  const totalPhones = leadsAll.length * 3;
  const validPhones =
    leadsAll
      .flatMap((l) => [l.telefone1, l.telefone2, l.telefone3])
      .filter((p) => (p ? phoneRegex.test(p.replace(/\D/g, "")) : false)).length ?? 0;
  const percentPhonesValid = totalPhones > 0 ? validPhones / totalPhones : 0;
  const docCounts = new Map<string, number>();
  leadsAll.forEach((l) => {
    const doc = l.documento ?? l.cnpj ?? "";
    if (!doc) return;
    docCounts.set(doc, (docCounts.get(doc) ?? 0) + 1);
  });
  const duplicates = Array.from(docCounts.values()).filter((v) => v > 1).length;
  const percentDuplicidades = leadsAll.length > 0 ? duplicates / leadsAll.length : 0;
  const cityCounts = new Map<string, number>();
  const ufCounts = new Map<string, number>();
  const ufGanhos = new Map<string, { ganhos: number; total: number }>();
  leadsAll.forEach((l) => {
    if (l.cidade) cityCounts.set(l.cidade, (cityCounts.get(l.cidade) ?? 0) + 1);
    if (l.estado) {
      ufCounts.set(l.estado, (ufCounts.get(l.estado) ?? 0) + 1);
      const item = ufGanhos.get(l.estado) ?? { ganhos: 0, total: 0 };
      item.total += 1;
      if (l.status === LeadStatus.FECHADO) item.ganhos += 1;
      ufGanhos.set(l.estado, item);
    }
  });
  const cidadesMaisComuns = Array.from(cityCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([cidade, count]) => ({ cidade, count }));
  const ufMaisLeads = Array.from(ufCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([uf, count]) => ({ uf, count }));
  const ufMelhorConversao = Array.from(ufGanhos.entries())
    .map(([uf, val]) => ({ uf, taxa: val.total > 0 ? val.ganhos / val.total : 0 }))
    .sort((a, b) => b.taxa - a.taxa)
    .slice(0, 5);

  // Atividades recentes
  const atividadesRecentesRaw = await prisma.leadActivity.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      activityType: true,
      outcomeLabel: true,
      createdAt: true,
      user: { select: { name: true, email: true } },
      lead: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
    },
  });
  const atividadesRecentes = atividadesRecentesRaw.map((a) => ({
    usuario: a.user?.name ?? a.user?.email ?? "Usuário",
    leadId: a.lead?.id ?? "",
    empresa: a.lead?.razaoSocial ?? a.lead?.nomeFantasia ?? "Lead",
    acao: a.activityType ?? a.outcomeLabel ?? "Atividade",
    createdAt: a.createdAt,
  }));

  return NextResponse.json({
    kpis: {
      totalLeads,
      leadsAtivos,
      leadsEmTratativa,
      leadsGanhos,
      leadsPerdidos,
      taxaConversaoGeral,
      leadsImportadosHoje,
      leadsImportadosSemana,
    },
    performanceConsultores: performanceConsultores,
    campanhas: campanhasPerf,
    heatmap: {
      top5Globais: heatmapGlobal.map((m) => ({ motivo: m.outcomeLabel, count: m._count.outcomeLabel })),
    },
    saude: {
      percentPhonesValid,
      percentDuplicidades,
      cidadesMaisComuns,
      ufMaisLeads,
      ufMelhorConversao,
    },
    atividadesRecentes,
  });
}
