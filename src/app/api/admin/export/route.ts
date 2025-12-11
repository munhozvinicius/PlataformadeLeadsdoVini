export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-helpers";
import { Prisma } from "@prisma/client";

export async function GET(req: Request) {
  const sessionUser = await getSessionUser();
  if (!sessionUser || sessionUser.role !== "MASTER") {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const campaignId = searchParams.get("campaignId");

  const where: Prisma.LeadWhereInput = {};
  if (campaignId) where.campanhaId = campaignId;

  // Fetch leads
  const leads = await prisma.lead.findMany({
    where,
    include: {
      consultor: {
        select: {
          name: true,
          email: true,
        },
      },
      campanha: {
        select: {
          nome: true,
        },
      },
    },
  });

  const leadIds = leads.map((l) => l.id);

  // Fetch latest activities for these leads
  // Prisma doesn't support 'distinct' with 'orderBy' perfectly in all generic ways for "last per group" efficiently in one simple query without raw SQL or distinct on specific fields if DB supports it.
  // Postgres supports distinct on.
  // We can use distinct: ['leadId'], orderBy: [{ leadId: 'asc' }, { createdAt: 'desc' }]
  const lastActivities = await prisma.leadActivity.findMany({
    where: {
      leadId: { in: leadIds },
    },
    distinct: ["leadId"],
    orderBy: [
      { leadId: "asc" },
      { createdAt: "desc" },
    ],
    select: {
      leadId: true,
      channel: true,
      createdAt: true,
    },
  });

  const activityMap = new Map();
  for (const item of lastActivities) {
    activityMap.set(item.leadId, item);
  }

  const header = [
    "empresa",
    "documento",
    "vertical",
    "stage",
    "campaignNome",
    "consultorNome",
    "consultorEmail",
    "lastActivityAt",
    "lastOutcomeLabel",
    "lastOutcomeNote",
    "ultimaAtividadeCanal",
    "ultimaAtividadeCriadaEm",
  ];

  const rows = leads.map((lead) => {
    const lastActivity = activityMap.get(lead.id);
    return [
      lead.EMPRESA || lead.razaoSocial || "",
      lead.documento || lead.DOCUMENTO || "",
      lead.vertical || lead.VERTICAL_COCKPIT || "",
      lead.status || "", // renamed from stage
      lead.campanha?.nome || "",
      lead.consultor?.name || "",
      lead.consultor?.email || "",
      lead.lastActivityAt ? lead.lastActivityAt.toISOString() : "",
      lead.lastOutcomeLabel || "",
      lead.lastOutcomeNote || "",
      lastActivity?.channel || "",
      lastActivity?.createdAt ? lastActivity.createdAt.toISOString() : "",
    ].join(";");
  });

  const csv = [header.join(";"), ...rows].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="leads_export.csv"',
    },
  });
}
