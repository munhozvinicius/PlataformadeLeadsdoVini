export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role, LeadStatus } from "@prisma/client";

type Params = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role === Role.CONSULTOR) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const campaignId = params.id;
  const leads = await prisma.lead.findMany({
    where: { campanhaId: campaignId },
    select: { id: true, documento: true, cnpj: true, telefone1: true, telefone2: true, telefone3: true, status: true },
  });

  const phoneRegex = /^\+?\d{8,15}$/;
  const invalidPhones = leads.filter((l) => {
    const phones = [l.telefone1, l.telefone2, l.telefone3].filter(Boolean).map((p) => p!.replace(/\D/g, ""));
    return phones.length === 0 || phones.every((p) => !phoneRegex.test(p));
  }).length;

  const docMap = new Map<string, number>();
  leads.forEach((l) => {
    const doc = l.documento ?? l.cnpj;
    if (!doc) return;
    docMap.set(doc, (docMap.get(doc) ?? 0) + 1);
  });
  const duplicated = Array.from(docMap.values()).filter((v) => v > 1).length;

  const invalids = leads.filter((l) => l.status === LeadStatus.PERDIDO || l.status === LeadStatus.EM_CONTATO).length;

  return NextResponse.json({
    total: leads.length,
    invalidPhones,
    duplicated,
    invalids,
  });
}
