export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserWithOffices, canDistributeLeads } from "@/lib/permissions";
import { LeadStatus } from "@prisma/client";
import { logLeadAction, computeLastActivityDate } from "@/lib/leadHistory";

type DistributionMode = "PER_CONSULTANT" | "TOTAL";

type DistributionFilters = {
  onlyStatus?: LeadStatus[];
  onlyWithPhone?: boolean;
  avoidDuplicates?: boolean;
};

type RequestBody = {
  consultants?: string[];
  mode?: DistributionMode;
  quantityPerConsultant?: number;
  totalQuantity?: number;
  filters?: DistributionFilters;
  officeId?: string | null;
};

function hasPhone(lead: { telefone?: string | null; telefone1?: string | null; telefone2?: string | null; telefone3?: string | null }) {
  return Boolean(lead.telefone || lead.telefone1 || lead.telefone2 || lead.telefone3);
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUserWithOffices();
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as RequestBody;
  const consultants = Array.isArray(body.consultants)
    ? body.consultants.filter((id) => typeof id === "string" && id.trim().length > 0)
    : [];
  const mode = body.mode;
  const officeId = body.officeId ?? null;
  const filters: DistributionFilters = body.filters ?? {};

  if (!(await canDistributeLeads(user, params.id, officeId))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  if (!consultants.length) {
    return NextResponse.json({ message: "Informe ao menos um consultor." }, { status: 400 });
  }

  if (mode !== "PER_CONSULTANT" && mode !== "TOTAL") {
    return NextResponse.json({ message: "Modo de distribuição inválido." }, { status: 400 });
  }

  const quantity =
    mode === "PER_CONSULTANT"
      ? Number(body.quantityPerConsultant ?? 0)
      : Number(body.totalQuantity ?? 0);

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return NextResponse.json({ message: "Quantidade inválida." }, { status: 400 });
  }

  const statuses = filters.onlyStatus?.length ? filters.onlyStatus : [LeadStatus.NOVO];

  const requiredCount = mode === "PER_CONSULTANT" ? quantity * consultants.length : quantity;
  const takeAmount = Math.max(requiredCount * 2, requiredCount); // pequena folga para filtros extras

  const eligibleWhere = {
    campanhaId: params.id,
    status: { in: statuses },
    OR: [{ consultorId: null }, { status: LeadStatus.NOVO }],
    ...(officeId ? { officeId } : {}),
  };

  const rawLeads = await prisma.lead.findMany({
    where: eligibleWhere,
    orderBy: { createdAt: "asc" },
    take: takeAmount,
    select: {
      id: true,
      consultorId: true,
      officeId: true,
      telefone: true,
      telefone1: true,
      telefone2: true,
      telefone3: true,
      documento: true,
      cnpj: true,
    },
  });

  let leads = rawLeads;
  if (filters.onlyWithPhone) {
    leads = leads.filter(hasPhone);
  }
  if (filters.avoidDuplicates) {
    const seen = new Set<string>();
    leads = leads.filter((lead) => {
      const key = (lead.documento ?? lead.cnpj ?? lead.id).toString();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  if (!leads.length) {
    return NextResponse.json({ message: "Nenhum lead elegível para distribuir." }, { status: 400 });
  }

  const assignments = new Map<string, string[]>(); // consultantId -> leadIds
  consultants.forEach((id) => assignments.set(id, []));

  const distributeCount = mode === "PER_CONSULTANT" ? quantity * consultants.length : quantity;
  let cursor = 0;
  while (cursor < leads.length && Array.from(assignments.values()).flat().length < distributeCount) {
    for (const consultant of consultants) {
      if (cursor >= leads.length) break;
      const current = assignments.get(consultant);
      if (!current) continue;
      if (mode === "PER_CONSULTANT" && current.length >= quantity) {
        continue;
      }
      current.push(leads[cursor].id);
      cursor += 1;
      if (Array.from(assignments.values()).flat().length >= distributeCount) break;
    }
  }

  const now = computeLastActivityDate();
  const distributedLeads = Array.from(assignments.entries())
    .map(([consultantId, leadIds]) => leadIds.map((leadId) => ({ leadId, consultantId })))
    .flat()
    .filter((entry) => entry.leadId);

  if (!distributedLeads.length) {
    return NextResponse.json({ message: "Não foi possível alocar leads com os filtros atuais." }, { status: 400 });
  }

  await prisma.$transaction(
    distributedLeads.map((entry) => {
      const previousConsultor = leads.find((l) => l.id === entry.leadId)?.consultorId;
      return prisma.lead.update({
        where: { id: entry.leadId },
        data: {
          consultorId: entry.consultantId,
          assignedToId: entry.consultantId,
          previousConsultants: previousConsultor ? { push: previousConsultor } : undefined,
          lastActivityDate: now,
        },
      });
    })
  );

  await Promise.all(
    distributedLeads.map((entry) =>
      logLeadAction({
        leadId: entry.leadId,
        action: "ASSIGN",
        fromUserId: leads.find((l) => l.id === entry.leadId)?.consultorId ?? undefined,
        toUserId: entry.consultantId,
        byUserId: user.id,
        notes: "Distribuição de leads",
      })
    )
  );

  const distributedPerConsultant = Object.fromEntries(
    Array.from(assignments.entries()).map(([consultantId, leadIds]) => [consultantId, leadIds.length])
  );
  const totalDistributed = distributedLeads.length;
  const remaining = await prisma.lead.count({ where: eligibleWhere });

  return NextResponse.json({
    distributedPerConsultant,
    totalDistributed,
    remaining,
    message: "Distribuição aplicada. TODO: Integrar com UI da aba Distribuição (Etapa 3).",
  });
}
