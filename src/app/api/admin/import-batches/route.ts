export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role === Role.CONSULTOR) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const batches = await prisma.importBatch.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      campaign: { select: { id: true, nome: true } },
      criadoPor: { select: { id: true, name: true, email: true } },
      _count: { select: { leads: true } },
    },
  });

  return NextResponse.json(
    batches.map((b) => ({
      id: b.id,
      nomeArquivoOriginal: b.nomeArquivoOriginal,
      campaignId: b.campaignId,
      campaignName: b.campaign?.nome ?? "",
      totalLeads: b.totalLeads ?? b._count.leads,
      importedLeads: b.importedLeads ?? b._count.leads,
      attributedLeads: b.attributedLeads ?? 0,
      notAttributedLeads: b.notAttributedLeads ?? 0,
      duplicatedLeads: b.duplicatedLeads ?? 0,
      status: b.status,
      createdAt: b.createdAt,
      criadoPor: b.criadoPor,
    }))
  );
}
