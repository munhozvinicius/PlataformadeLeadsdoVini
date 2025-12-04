export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LeadStatus, Prisma, Role } from "@prisma/client";

type Params = { params: { id: string } };

type ConsultantDetail = { id: string; officeId?: string | null };

type LeadAssignment = Record<string, string[]>;

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role === Role.CONSULTOR) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const campaignId = params.id;
    const officeId = _req.nextUrl.searchParams.get("officeId");
    const total = await prisma.lead.count({ where: { campanhaId: campaignId } });
    const estoqueWhere: Prisma.LeadWhereInput = {
      campanhaId: campaignId,
      consultorId: null,
    };
    if (officeId) {
      estoqueWhere.officeId = officeId;
    }
    const atribuidosWhere: Prisma.LeadWhereInput = {
      campanhaId: campaignId,
      consultorId: { not: null },
    };
    if (officeId) {
      atribuidosWhere.officeId = officeId;
    }

    const estoque = await prisma.lead.count({ where: estoqueWhere });
    const atribuidos = await prisma.lead.count({ where: atribuidosWhere });
    const fechados = await prisma.lead.count({ where: { campanhaId: campaignId, status: LeadStatus.FECHADO } });
    const perdidos = await prisma.lead.count({ where: { campanhaId: campaignId, status: LeadStatus.PERDIDO } });

    const grouped = await prisma.lead.groupBy({
      by: ["consultorId", "status"],
      _count: { status: true },
      where: atribuidosWhere,
    });

    const leadDetails = await prisma.lead.findMany({
      where: { campanhaId: campaignId, consultorId: { not: null }, ...(officeId ? { officeId } : {}) },
      select: {
        consultorId: true,
        status: true,
        createdAt: true,
        lastActivityAt: true,
        lastStatusChangeAt: true,
        updatedAt: true,
      },
    });

    const stats = new Map<
      string,
      {
        total: number;
        worked: number;
        closed: number;
        lost: number;
        totalTimeMs: number;
        timeCount: number;
        lastActivityAt?: Date | null;
      }
    >();

    leadDetails.forEach((lead) => {
      if (!lead.consultorId) return;
      const entry = stats.get(lead.consultorId) ?? {
        total: 0,
        worked: 0,
        closed: 0,
        lost: 0,
        totalTimeMs: 0,
        timeCount: 0,
        lastActivityAt: null,
      };
      entry.total += 1;
      if (lead.status !== LeadStatus.NOVO) {
        entry.worked += 1;
      }
      if (lead.status === LeadStatus.FECHADO) {
        entry.closed += 1;
      }
      if (lead.status === LeadStatus.PERDIDO) {
        entry.lost += 1;
      }
      const referenceTime = lead.lastActivityAt ?? lead.lastStatusChangeAt ?? lead.updatedAt ?? lead.createdAt;
      if (referenceTime) {
        if (!entry.lastActivityAt || referenceTime.getTime() > entry.lastActivityAt.getTime()) {
          entry.lastActivityAt = referenceTime;
        }
        if (lead.createdAt) {
          const diff = referenceTime.getTime() - lead.createdAt.getTime();
          if (diff > 0) {
            entry.totalTimeMs += diff;
            entry.timeCount += 1;
          }
        }
      }
      stats.set(lead.consultorId, entry);
    });

    const consultorIds = Array.from(
      new Set<string>(
        grouped
          .map((g) => g.consultorId ?? "")
          .concat(
            leadDetails.map((lead) => lead.consultorId ?? "").filter(Boolean)
          )
          .filter(Boolean)
      )
    );

    const consultants = await prisma.user.findMany({
      where: { id: { in: consultorIds }, role: Role.CONSULTOR },
      select: { id: true, name: true, email: true, office: { select: { name: true } } },
    });

    const consultantMap = new Map<
      string,
      { name?: string | null; email?: string | null; officeName?: string | null }
    >();
    consultants.forEach((c) => {
      consultantMap.set(c.id, { name: c.name, email: c.email, officeName: c.office?.name ?? "" });
    });

    const distribution = consultorIds.map((cid) => {
      const statuses = grouped.filter((g) => g.consultorId === cid);
      const totalAtribuidos = statuses.reduce((acc, cur) => acc + cur._count.status, 0);
      const trabalhados = statuses
        .filter((s) => s.status !== LeadStatus.NOVO)
        .reduce((acc, cur) => acc + cur._count.status, 0);
      const fech = statuses.find((s) => s.status === LeadStatus.FECHADO)?.["_count"].status ?? 0;
      const perd = statuses.find((s) => s.status === LeadStatus.PERDIDO)?.["_count"].status ?? 0;
      const stat = stats.get(cid);
      const tempoMedioTratativaMs = stat?.timeCount ? Math.round(stat.totalTimeMs / stat.timeCount) : 0;
      const ultimaAtividadeAt = stat?.lastActivityAt ? stat.lastActivityAt.toISOString() : null;

      const meta = consultantMap.get(cid) ?? {};
      const percentConcluido = totalAtribuidos > 0 ? Math.round((trabalhados / totalAtribuidos) * 100) : 0;
      return {
        officeName: meta.officeName ?? "",
        consultantId: cid,
        consultantName: meta.name ?? meta.email ?? "Consultor",
        totalAtribuidos,
        trabalhados,
        restantes: totalAtribuidos - trabalhados,
        fechados: fech,
        perdidos: perd,
        percentConcluido,
        tempoMedioTratativaMs,
        ultimaAtividadeAt,
      };
    });

    return NextResponse.json({
      resumo: { total, estoque, atribuidos, fechados, perdidos },
      distribution,
    });
  } catch (error) {
    console.error("distribution GET error", error);
    return NextResponse.json({ message: "Erro ao carregar distribuição" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== Role.MASTER) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const campaignId = params.id;
    const body = (await req.json().catch(() => ({}))) as {
      consultantIds?: string[];
      quantityPerConsultant?: number;
      auto?: boolean;
      officeId?: string;
    };
    const takeAll = Boolean(body.auto);
    const officeId = body.officeId ?? "";

    if (!officeId) {
      return NextResponse.json({ message: "officeId é obrigatório" }, { status: 400 });
    }

    const office = await prisma.officeRecord.findUnique({ where: { id: officeId } });
    if (!office) {
      return NextResponse.json({ message: "Escritório inválido" }, { status: 400 });
    }
    const rawConsultantIds = Array.isArray(body.consultantIds)
      ? Array.from(new Set(body.consultantIds.filter(Boolean)))
      : [];
    const quantityPerConsultant = Number(body.quantityPerConsultant ?? 0);

    let targetConsultants: ConsultantDetail[] = [];

    if (takeAll) {
      const autoWhere: { role: Role; id?: { in: string[] }; officeId: string } = {
        role: Role.CONSULTOR,
        officeId,
      };
      if (rawConsultantIds.length > 0) {
        autoWhere.id = { in: rawConsultantIds };
      }
      targetConsultants = await prisma.user.findMany({
        where: autoWhere,
        select: { id: true, officeId: true },
      });
    } else {
      if (rawConsultantIds.length === 0) {
        return NextResponse.json({ message: "Selecione ao menos um consultor para distribuir." }, { status: 400 });
      }
      const consultants = await prisma.user.findMany({
        where: { id: { in: rawConsultantIds }, role: Role.CONSULTOR, officeId },
        select: { id: true, officeId: true },
      });
      const consultantMap = new Map(consultants.map((c) => [c.id, c]));
      const resolvedConsultants: ConsultantDetail[] = [];
      for (const id of rawConsultantIds) {
        const candidate = consultantMap.get(id);
        if (candidate) {
          resolvedConsultants.push(candidate);
        }
      }
      targetConsultants = resolvedConsultants;
    }

    if (targetConsultants.length === 0) {
      return NextResponse.json({ message: "Nenhum consultor válido encontrado." }, { status: 400 });
    }
    if (!takeAll && (!quantityPerConsultant || Number.isNaN(quantityPerConsultant))) {
      return NextResponse.json({ message: "Quantidade por consultor inválida." }, { status: 400 });
    }

    const stockWhere: Prisma.LeadWhereInput = {
      campanhaId: campaignId,
      status: LeadStatus.NOVO,
      consultorId: null,
      officeId,
    };
    const totalStock = await prisma.lead.count({ where: stockWhere });
    if (totalStock === 0) {
      return NextResponse.json(
        { message: "Estoque vazio para esta campanha. Nenhum lead disponível." },
        { status: 400 }
      );
    }

    const takeSize = takeAll ? totalStock : Math.min(totalStock, quantityPerConsultant * targetConsultants.length);
    const stockLeads = await prisma.lead.findMany({
      where: stockWhere,
      orderBy: { createdAt: "asc" },
      take: takeSize,
      select: { id: true },
    });
    if (stockLeads.length === 0) {
      return NextResponse.json(
        { message: "Estoque vazio para esta campanha. Nenhum lead disponível." },
        { status: 400 }
      );
    }

    const assignments: LeadAssignment = takeAll
      ? buildAutoAssignments(stockLeads, targetConsultants)
      : buildManualAssignments(stockLeads, targetConsultants, quantityPerConsultant);

    const updatePromises = [];
    const logPromises = [];
    const distributed: Record<string, number> = {};

    const rulesApplied = describeRules({
      auto: takeAll,
      quantity: quantityPerConsultant,
      officeName: office.name,
    });

    for (const consultant of targetConsultants) {
      const leadIds = assignments[consultant.id] ?? [];
      distributed[consultant.id] = leadIds.length;
      if (leadIds.length === 0) continue;
      updatePromises.push(
        prisma.lead.updateMany({
          where: { id: { in: leadIds } },
          data: {
            consultorId: consultant.id,
            officeId: consultant.officeId ?? null,
            status: LeadStatus.NOVO,
            isWorked: false,
            nextFollowUpAt: null,
            nextStepNote: null,
            lastStatusChangeAt: new Date(),
            lastActivityAt: null,
          },
        })
      );
      logPromises.push(
        prisma.distributionLog.create({
          data: {
            campaignId,
            adminId: session.user.id,
            consultantId: consultant.id,
            leadIds,
            rulesApplied,
          },
        })
      );
    }

    await Promise.all(updatePromises);
    await Promise.all(logPromises);

    const remainingStock = await prisma.lead.count({ where: stockWhere });

    return NextResponse.json({ success: true, distributed, remainingStock });
  } catch (error) {
    console.error("distribution POST error", error);
    return NextResponse.json({ message: "Erro ao distribuir leads" }, { status: 500 });
  }
}

function buildManualAssignments(leads: { id: string }[], consultants: ConsultantDetail[], quantity: number): LeadAssignment {
  const assignments: LeadAssignment = {};
  consultants.forEach((consultant) => {
    assignments[consultant.id] = [];
  });
  if (quantity <= 0) {
    return assignments;
  }
  let cursor = 0;
  for (const consultant of consultants) {
    const slice = leads.slice(cursor, cursor + quantity);
    cursor += quantity;
    assignments[consultant.id] = slice.map((lead) => lead.id);
    if (cursor >= leads.length) {
      break;
    }
  }
  return assignments;
}

function buildAutoAssignments(leads: { id: string }[], consultants: ConsultantDetail[]): LeadAssignment {
  const assignments: LeadAssignment = {};
  consultants.forEach((consultant) => {
    assignments[consultant.id] = [];
  });
  if (consultants.length === 0 || leads.length === 0) {
    return assignments;
  }
  let index = 0;
  while (index < leads.length) {
    for (const consultant of consultants) {
      if (index >= leads.length) {
        break;
      }
      assignments[consultant.id].push(leads[index].id);
      index += 1;
    }
  }
  return assignments;
}

function describeRules(options: { auto: boolean; quantity: number; officeName?: string | null }) {
  const segments = [];
  if (options.auto) {
    segments.push("Distribuição igualitária automática");
  } else {
    segments.push(`Distribuição manual (${options.quantity} por consultor)`);
  }
  if (options.officeName) {
    segments.push(`escritório ${options.officeName}`);
  }
  return segments.join(" | ");
}
