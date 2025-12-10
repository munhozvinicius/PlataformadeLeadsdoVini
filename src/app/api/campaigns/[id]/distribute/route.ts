export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserWithOffices, canDistributeLeads } from "@/lib/permissions";
import { LeadStatus } from "@prisma/client";
import { computeLastActivityDate, logLeadAction } from "@/lib/leadHistory";
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

const distributeSchema = z.object({
  consultantIds: z.array(z.string().trim()).min(1, "Selecione ao menos um consultor"),
  quantityPerConsultant: z
    .preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number().int().min(1).optional()),
  mode: z.enum(["manual", "auto"]),
  filters: z
    .object({
      onlyNew: z.boolean().optional(),
      onlyUnassigned: z.boolean().optional(),
      onlyWithPhone: z.boolean().optional(),
      ignoreInvalidPhones: z.boolean().optional(),
    })
    .optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getSessionUserWithOffices();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const parsed = distributeSchema.safeParse(body);
    if (!parsed.success) {
      console.error("[distribute] validation error:", parsed.error.flatten());
      return NextResponse.json({ error: "Payload inválido para distribuição", issues: parsed.error.flatten() }, { status: 422 });
    }

    const { consultantIds, quantityPerConsultant, mode, filters } = parsed.data;
    const onlyNew = filters?.onlyNew ?? true;
    const onlyUnassigned = filters?.onlyUnassigned ?? true;
    const onlyWithPhone = filters?.onlyWithPhone ?? false;
    const ignoreInvalidPhones = filters?.ignoreInvalidPhones ?? false;

    if (!(await canDistributeLeads(user, params.id, null))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (mode === "manual" && (!quantityPerConsultant || quantityPerConsultant <= 0)) {
      return NextResponse.json({ error: "Quantidade por consultor inválida." }, { status: 400 });
    }

    const campaign = await prisma.campanha.findUnique({ where: { id: params.id } });
    if (!campaign) {
      return NextResponse.json({ error: "Campanha não encontrada." }, { status: 400 });
    }
    if (campaign.status && campaign.status !== "ATIVA") {
      return NextResponse.json({ error: "Campanha não está ativa." }, { status: 400 });
    }

    const total = await prisma.lead.count({ where: { campanhaId: params.id } });

    const baseWhere: Record<string, unknown> = { campanhaId: params.id };
    if (onlyNew) baseWhere.status = LeadStatus.NOVO;
    if (onlyUnassigned) baseWhere.consultorId = null;

    const availableLeads = await prisma.lead.findMany({
      where: baseWhere,
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        consultorId: true,
        telefone: true,
        telefone1: true,
        telefone2: true,
        telefone3: true,
      },
    });

    const available = availableLeads.length;
    if (available === 0) {
      return NextResponse.json(
        { error: "Não há leads disponíveis para esta campanha.", total, available, filteredAvailable: 0 },
        { status: 409 }
      );
    }

    let filteredLeads = availableLeads;
    if (onlyWithPhone || ignoreInvalidPhones) {
      filteredLeads = filteredLeads.filter(hasPhone);
    }
    if (ignoreInvalidPhones) {
      const phoneRegex = /^\+?\d{8,15}$/;
      filteredLeads = filteredLeads.filter((lead) => {
        const phones = [lead.telefone, lead.telefone1, lead.telefone2, lead.telefone3]
          .filter(Boolean)
          .map((p) => (p ?? "").replace(/\D/g, ""));
        if (phones.length === 0) return false;
        return phones.some((p) => phoneRegex.test(p));
      });
    }

    const filteredAvailable = filteredLeads.length;
    if (filteredAvailable === 0) {
      return NextResponse.json(
        { error: "Nenhum lead disponível com os filtros aplicados.", available, total, filteredAvailable },
        { status: 409 }
      );
    }

    // status/onlyNew and onlyUnassigned already respected by query default; flags kept for compatibility
    const leadsToUse = filteredLeads;

    const assignments = new Map<string, string[]>();
    consultantIds.forEach((id) => assignments.set(id, []));

    if (mode === "manual") {
      const needed = consultantIds.length * (quantityPerConsultant ?? 0);
      const toDistribute = Math.min(needed, leadsToUse.length);
      let cursor = 0;
      for (const consultantId of consultantIds) {
        const slice = leadsToUse.slice(cursor, cursor + (quantityPerConsultant ?? 0));
        cursor += slice.length;
        assignments.set(consultantId, slice.map((s) => s.id));
      }
      if (toDistribute < needed) {
        // continue best-effort, no early return
      }
    } else {
      const base = Math.floor(leadsToUse.length / consultantIds.length);
      let rest = leadsToUse.length % consultantIds.length;
      let cursor = 0;
      for (const consultantId of consultantIds) {
        const qty = base + (rest > 0 ? 1 : 0);
        if (rest > 0) rest -= 1;
        if (qty <= 0) continue;
        const slice = leadsToUse.slice(cursor, cursor + qty);
        cursor += slice.length;
        assignments.set(consultantId, slice.map((s) => s.id));
      }
    }

    const updates = Array.from(assignments.entries())
      .map(([consultantId, leadIds]) => ({ consultantId, leadIds: leadIds.filter(Boolean) }))
      .filter((entry) => entry.leadIds.length > 0);

    if (updates.length === 0) {
      return NextResponse.json(
        { error: "Não foi possível alocar leads com os parâmetros informados." },
        { status: 409 }
      );
    }

    const now = computeLastActivityDate();
    await Promise.all(
      updates.map((entry) =>
        prisma.lead.updateMany({
          where: { id: { in: entry.leadIds } },
          data: { consultorId: entry.consultantId, assignedToId: entry.consultantId, lastActivityDate: now },
        })
      )
    );

    await Promise.all(
      updates.flatMap((entry) =>
        entry.leadIds.map((leadId) =>
          logLeadAction({
            leadId,
            action: "DISTRIBUICAO_AUTOMATICA",
            fromUserId: null,
            toUserId: entry.consultantId,
            byUserId: user.id,
            notes: mode === "auto" ? "Distribuição automática" : "Distribuição manual",
          })
        )
      )
    );

    const totalDistributed = updates.reduce((acc, entry) => acc + entry.leadIds.length, 0);
    const perConsultant = Object.fromEntries(updates.map((entry) => [entry.consultantId, entry.leadIds.length]));

    return NextResponse.json({
      success: true,
      distributed: { total: totalDistributed, byConsultant: perConsultant },
      requested: mode === "manual" ? consultantIds.length * (quantityPerConsultant ?? 0) : totalDistributed,
      remaining: Math.max(available - totalDistributed, 0),
      total,
      available,
      filteredAvailable,
      message:
        mode === "manual" && totalDistributed < (consultantIds.length * (quantityPerConsultant ?? 0))
          ? "Nem todos os leads solicitados estavam disponíveis. Distribuição parcial concluída."
          : undefined,
    });
  } catch (err) {
    console.error("[distribute] unexpected error:", err);
    return NextResponse.json({ error: "Erro interno ao distribuir leads" }, { status: 500 });
  }
}
