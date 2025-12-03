export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LeadStatus, Role } from "@prisma/client";

type Params = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role === Role.CONSULTOR) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const campaignId = params.id;
    const total = await prisma.lead.count({ where: { campanhaId: campaignId } });
    const estoqueWhere = {
      campanhaId: campaignId,
      consultorId: null,
    };
    const atribuidosWhere = {
      campanhaId: campaignId,
      consultorId: { not: null },
    };

    const estoque = await prisma.lead.count({ where: estoqueWhere });
    const atribuidos = await prisma.lead.count({ where: atribuidosWhere });
    const fechados = await prisma.lead.count({ where: { campanhaId: campaignId, status: LeadStatus.FECHADO } });
    const perdidos = await prisma.lead.count({ where: { campanhaId: campaignId, status: LeadStatus.PERDIDO } });

    const grouped = await prisma.lead.groupBy({
      by: ["consultorId", "status"],
      _count: { status: true },
      where: atribuidosWhere,
    });

    const consultorIds = Array.from(new Set(grouped.map((g) => g.consultorId).filter(Boolean))) as string[];
    const consultores = await prisma.user.findMany({
      where: { id: { in: consultorIds } },
      select: { id: true, name: true, email: true, office: { select: { name: true } } },
    });
    const consultorMap = new Map<
      string,
      { name?: string | null; email?: string | null; officeName?: string | null }
    >();
    consultores.forEach((c) => {
      consultorMap.set(c.id, { name: c.name, email: c.email, officeName: c.office?.name ?? "" });
    });

    const distribution = consultorIds.map((cid) => {
      const statuses = grouped.filter((g) => g.consultorId === cid);
      const totalAtribuidos = statuses.reduce((acc, cur) => acc + cur._count.status, 0);
      const trabalhados = statuses
        .filter((s) => s.status !== LeadStatus.NOVO)
        .reduce((acc, cur) => acc + cur._count.status, 0);
      const fech = statuses.find((s) => s.status === LeadStatus.FECHADO)?.["_count"].status ?? 0;
      const perd = statuses.find((s) => s.status === LeadStatus.PERDIDO)?.["_count"].status ?? 0;

      const meta = consultorMap.get(cid) ?? {};
      return {
        officeName: meta.officeName ?? "",
        consultantId: cid,
        consultantName: meta.name ?? meta.email ?? "Consultor",
        totalAtribuidos,
        trabalhados,
        restantes: totalAtribuidos - trabalhados,
        fechados: fech,
        perdidos: perd,
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

    const body = await req.json();
    const { officeId, consultantIds, quantityPerConsultant } = body as {
      officeId?: string | null;
      consultantIds?: string[];
      quantityPerConsultant?: number;
    };

    if (!Array.isArray(consultantIds) || consultantIds.length === 0) {
      return NextResponse.json({ message: "Selecione pelo menos um consultor" }, { status: 400 });
    }
    if (!quantityPerConsultant || quantityPerConsultant <= 0) {
      return NextResponse.json({ message: "Quantidade por consultor inválida" }, { status: 400 });
    }

    const campaignId = params.id;
    const totalNeeded = quantityPerConsultant * consultantIds.length;
    // Pega leads em estoque (sem consultor, status NOVO)
    const stockWhere = {
      campanhaId: campaignId,
      status: LeadStatus.NOVO,
      consultorId: null,
    };

    const stockLeads = await prisma.lead.findMany({
      where: stockWhere,
      orderBy: { createdAt: "asc" },
      take: totalNeeded,
      select: { id: true },
    });

    if (stockLeads.length === 0) {
      return NextResponse.json(
        { success: false, message: "Estoque vazio para esta campanha. Nenhum lead disponível." },
        { status: 400 }
      );
    }

    const distributed: Record<string, number> = {};
    let cursor = 0;
    for (const consultantId of consultantIds) {
      const slice = stockLeads.slice(cursor, cursor + quantityPerConsultant);
      cursor += quantityPerConsultant;
      if (slice.length === 0) {
        distributed[consultantId] = 0;
        continue;
      }
      const consultant = await prisma.user.findUnique({
        where: { id: consultantId },
        select: { officeId: true },
      });
      await prisma.lead.updateMany({
        where: { id: { in: slice.map((s) => s.id) } },
        data: {
          consultorId: consultantId,
          officeId: consultant?.officeId ?? officeId ?? null,
          status: LeadStatus.NOVO,
          isWorked: false,
          nextFollowUpAt: null,
          nextStepNote: null,
          lastStatusChangeAt: new Date(),
        },
      });
      distributed[consultantId] = slice.length;
    }

    const remainingStock = await prisma.lead.count({ where: stockWhere });

    return NextResponse.json({ success: true, distributed, remainingStock });
  } catch (error) {
    console.error("distribution POST error", error);
    return NextResponse.json({ message: "Erro ao distribuir leads" }, { status: 500 });
  }
}
