export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserWithOffices, canDistributeLeads } from "@/lib/permissions";
import { LeadStatus, Role } from "@prisma/client";
import { logLeadAction, computeLastActivityDate } from "@/lib/leadHistory";
import { z } from "zod";

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

const distributeSchema = z.object({
  consultantIds: z.array(z.string()).min(1, "Selecione ao menos um consultor"),
  quantityPerConsultant: z.preprocess(
    (v) => (typeof v === "string" ? Number(v) : v),
    z.number().int().min(1, "Quantidade deve ser >= 1")
  ),
  officeId: z.string().optional(),
  filters: z
    .object({
      onlyNew: z.boolean().optional(),
      onlyUnassigned: z.boolean().optional(),
      onlyWithPhone: z.boolean().optional(),
      ignoreInvalidPhones: z.boolean().optional(),
      faturamentoMin: z
        .preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number().optional())
        .optional(),
      faturamentoMax: z
        .preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number().optional())
        .optional(),
    })
    .optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getSessionUserWithOffices();
    if (!user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    console.log("DEBUG /distribute – raw body:", body);
    const parsed = distributeSchema.safeParse(body);
    if (!parsed.success) {
      console.error("DEBUG /distribute – validation error:", parsed.error.flatten());
      return NextResponse.json(
        { error: "Payload inválido para distribuição", issues: parsed.error.flatten() },
        { status: 422 }
      );
    }

    const { consultantIds, quantityPerConsultant, officeId, filters } = parsed.data;
    const onlyNew = filters?.onlyNew ?? true;
    const onlyUnassigned = filters?.onlyUnassigned ?? true;
    const onlyWithPhone = filters?.onlyWithPhone ?? false;
    const ignoreInvalidPhones = filters?.ignoreInvalidPhones ?? false;
    const faturamentoMin = filters?.faturamentoMin;
    const faturamentoMax = filters?.faturamentoMax;

  const consultantRecords = await prisma.user.findMany({
    where: { id: { in: consultantIds }, role: Role.CONSULTOR },
    select: {
      id: true,
      name: true,
      email: true,
      officeRecordId: true,
      role: true,
    },
  });

  if (consultantRecords.length !== consultantIds.length) {
    return NextResponse.json({ message: "Alguns consultores são inválidos." }, { status: 400 });
  }

  const consultantOfficeIds = consultantRecords
    .map((c) => c.officeRecordId)
    .filter((id): id is string => Boolean(id));

  if (!(await canDistributeLeads(user, params.id, officeId ?? null))) {
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
    officeId && officeId.length > 0
      ? [officeId]
      : consultantOfficeIds.length
      ? consultantOfficeIds
      : Array.from(allowedOffices);

  const requiredCount = quantityPerConsultant * consultantIds.length;
  const takeAmount = Math.max(requiredCount * 2, requiredCount + 10);

  const eligibleWhere: Record<string, unknown> = {
    campanhaId: params.id,
    ...(onlyNew ? { status: LeadStatus.NOVO } : {}),
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
      status: true,
      assignedToId: true,
    },
  });

  let leads = rawLeads;
  if (onlyWithPhone || ignoreInvalidPhones) {
    leads = leads.filter(hasPhone);
  }
  if (ignoreInvalidPhones) {
    const phoneRegex = /^\+?\d{8,15}$/;
    leads = leads.filter((lead) => {
      const phones = [lead.telefone, lead.telefone1, lead.telefone2, lead.telefone3]
        .filter(Boolean)
        .map((p) => (p ?? "").replace(/\D/g, ""));
      if (phones.length === 0) return false;
      return phones.some((p) => phoneRegex.test(p));
    });
  }
  if (faturamentoMin != null || faturamentoMax != null) {
    leads = leads.filter((lead) => {
      const revenue = parseRevenue(lead.vlFatPresumido);
      if (faturamentoMin != null && (revenue == null || revenue < faturamentoMin)) return false;
      if (faturamentoMax != null && (revenue == null || revenue > faturamentoMax)) return false;
      return true;
    });
  }

  if (!leads.length) {
    return NextResponse.json(
      { error: "Não há leads disponíveis para esta campanha/escritório com os filtros aplicados." },
      { status: 409 }
    );
  }

  const assignments = new Map<string, string[]>(); // consultantId -> leadIds
  consultantIds.forEach((id) => assignments.set(id, []));

  let cursor = 0;
  for (const consultantId of consultantIds) {
    const current = assignments.get(consultantId);
    if (!current) continue;
    while (current.length < quantityPerConsultant && cursor < leads.length) {
      current.push(leads[cursor].id);
      cursor += 1;
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
    ok: true,
    totalEligible: leads.length,
    totalDistributed,
    perConsultant,
    message: "Distribuição aplicada com sucesso.",
  });
  } catch (err) {
    console.error("DEBUG /distribute – unexpected error:", err);
    return NextResponse.json({ error: "Erro interno ao distribuir leads" }, { status: 500 });
  }
}
