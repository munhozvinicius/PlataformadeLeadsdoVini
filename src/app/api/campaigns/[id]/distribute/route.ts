export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserWithOffices, canDistributeLeads } from "@/lib/permissions";
import { LeadStatus, Role } from "@prisma/client";
import { logLeadAction, computeLastActivityDate } from "@/lib/leadHistory";

type DistributionMode = "PER_CONSULTANT" | "TOTAL";

type DistributionFilters = {
  statuses?: LeadStatus[];
  onlyUnassigned?: boolean;
  onlyWithPhones?: boolean;
  onlyValidPhones?: boolean;
  minRevenue?: number | null;
  maxRevenue?: number | null;
};

type RequestBody = {
  consultantIds?: string[];
  mode?: DistributionMode;
  quantityPerConsultant?: number;
  quantityTotal?: number;
  filters?: DistributionFilters;
  respectOffices?: boolean;
};

function hasPhone(lead: {
  telefone?: string | null;
  telefone1?: string | null;
  telefone2?: string | null;
  telefone3?: string | null;
}) {
  return Boolean(
    (lead.telefone ?? "").trim() ||
      (lead.telefone1 ?? "").trim() ||
      (lead.telefone2 ?? "").trim() ||
      (lead.telefone3 ?? "").trim()
  );
}

function parseRevenue(value?: string | null) {
  if (!value) return null;
  const normalized = value
    .replace(/[^\d.,]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUserWithOffices();
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as RequestBody;
  const consultants = Array.isArray(body.consultantIds)
    ? body.consultantIds.filter((id) => typeof id === "string" && id.trim().length > 0)
    : [];
  const mode = body.mode;
  const filters: DistributionFilters = body.filters ?? {};

  if (!consultants.length) {
    return NextResponse.json({ message: "Informe ao menos um consultor." }, { status: 400 });
  }

  if (mode !== "PER_CONSULTANT" && mode !== "TOTAL") {
    return NextResponse.json({ message: "Modo de distribuição inválido." }, { status: 400 });
  }

  const quantity =
    mode === "PER_CONSULTANT"
      ? Number(body.quantityPerConsultant ?? 0)
      : Number(body.quantityTotal ?? 0);

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return NextResponse.json({ message: "Quantidade inválida." }, { status: 400 });
  }

  const allowedStatuses = new Set<LeadStatus>(Object.values(LeadStatus));
  const statuses = (filters.statuses?.length ? filters.statuses : [LeadStatus.NOVO]).filter((status) =>
    allowedStatuses.has(status)
  );
  const onlyUnassigned = filters.onlyUnassigned !== false;
  const respectOffices = Boolean(body.respectOffices);

  const consultantRecords = await prisma.user.findMany({
    where: { id: { in: consultants }, role: Role.CONSULTOR },
    select: {
      id: true,
      name: true,
      email: true,
      officeRecordId: true,
      role: true,
    },
  });

  if (consultantRecords.length !== consultants.length) {
    return NextResponse.json({ message: "Alguns consultores são inválidos." }, { status: 400 });
  }

  const consultantOfficeIds = consultantRecords
    .map((c) => c.officeRecordId)
    .filter((id): id is string => Boolean(id));

  if (!(await canDistributeLeads(user, params.id, null))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const allowedOffices = new Set<string>();
  if (user.role === Role.GERENTE_NEGOCIOS) {
    const notManaged = consultantOfficeIds.filter((officeId) => officeId && !user.managedOfficeIds.includes(officeId));
    if (notManaged.length > 0) {
      return NextResponse.json({ message: "Consultor fora do seu escopo de escritórios." }, { status: 403 });
    }
    user.managedOfficeIds.forEach((id) => allowedOffices.add(id));
  }
  if (user.role === Role.PROPRIETARIO) {
    if (user.officeRecordId && consultantOfficeIds.some((officeId) => officeId && officeId !== user.officeRecordId)) {
      return NextResponse.json({ message: "Consultor fora do seu escritório." }, { status: 403 });
    }
    if (user.officeRecordId) {
      allowedOffices.add(user.officeRecordId);
    }
  }

  const officeConstraint =
    respectOffices && consultantOfficeIds.length
      ? consultantOfficeIds.filter(
          (officeId) => officeId && (!allowedOffices.size || allowedOffices.has(officeId))
        )
      : Array.from(allowedOffices);

  const requiredCount = mode === "PER_CONSULTANT" ? quantity * consultants.length : quantity;
  const takeAmount = Math.max(requiredCount * 2, requiredCount + 10);

  const statusFilter = statuses.length ? statuses : [LeadStatus.NOVO];

  const eligibleWhere = {
    campanhaId: params.id,
    status: { in: statusFilter },
    ...(onlyUnassigned ? { consultorId: null } : {}),
    ...(officeConstraint.length ? { officeId: { in: officeConstraint } } : {}),
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
      vlFatPresumido: true,
    },
  });

  let leads = rawLeads;
  if (filters.onlyWithPhones || filters.onlyValidPhones) {
    leads = leads.filter(hasPhone);
  }
  if (filters.minRevenue != null || filters.maxRevenue != null) {
    leads = leads.filter((lead) => {
      const revenue = parseRevenue(lead.vlFatPresumido);
      if (filters.minRevenue != null && (revenue == null || revenue < filters.minRevenue)) return false;
      if (filters.maxRevenue != null && (revenue == null || revenue > filters.maxRevenue)) return false;
      return true;
    });
  }

  if (!leads.length) {
    return NextResponse.json({ message: "Nenhum lead elegível para distribuir." }, { status: 400 });
  }

  const assignments = new Map<string, string[]>(); // consultantId -> leadIds
  consultants.forEach((id) => assignments.set(id, []));

  if (mode === "PER_CONSULTANT") {
    let cursor = 0;
    for (const consultantId of consultants) {
      const current = assignments.get(consultantId);
      if (!current) continue;
      while (current.length < quantity && cursor < leads.length) {
        current.push(leads[cursor].id);
        cursor += 1;
      }
    }
  } else {
    let cursor = 0;
    let distributed = 0;
    while (cursor < leads.length && distributed < quantity) {
      for (const consultantId of consultants) {
        if (cursor >= leads.length || distributed >= quantity) break;
        const current = assignments.get(consultantId);
        if (!current) continue;
        current.push(leads[cursor].id);
        cursor += 1;
        distributed += 1;
      }
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
        action: "DISTRIBUICAO_AUTOMATICA",
        fromUserId: leads.find((l) => l.id === entry.leadId)?.consultorId ?? undefined,
        toUserId: entry.consultantId,
        byUserId: user.id,
        notes: "Distribuição de leads",
      })
    )
  );

  const perConsultant = consultantRecords.map((consultant) => ({
    consultantId: consultant.id,
    name: consultant.name ?? consultant.email ?? consultant.id,
    email: consultant.email ?? "",
    distributed: assignments.get(consultant.id)?.length ?? 0,
  }));
  const totalDistributed = distributedLeads.length;

  return NextResponse.json({
    totalEligible: leads.length,
    totalDistributed,
    perConsultant,
    message: "Distribuição aplicada com sucesso.",
  });
}
