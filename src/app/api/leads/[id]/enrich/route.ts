import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchExternalEnrichmentForLead, EnrichmentSuggestion } from "@/lib/enrichment/externalEnrichmentService";
import { Role } from "@prisma/client";
import { isOfficeAdmin } from "@/lib/authRoles";

type Params = { params: { id: string } };

async function ensurePermission(leadId: string, userId: string, role: Role) {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { consultorId: true, ownerId: true, officeId: true },
  });
  if (!lead) return { error: NextResponse.json({ message: "Lead não encontrado" }, { status: 404 }) };

  if (role === Role.CONSULTOR && lead.consultorId !== userId) {
    return { error: NextResponse.json({ message: "Unauthorized" }, { status: 401 }) };
  }
  if (role === Role.PROPRIETARIO && lead.ownerId !== userId) {
    return { error: NextResponse.json({ message: "Unauthorized" }, { status: 401 }) };
  }
  if (isOfficeAdmin(role) && role !== Role.MASTER) {
    const sessionUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { officeRecordId: true },
    });
    if (!sessionUser?.officeRecordId || (lead.officeId && lead.officeId !== sessionUser.officeRecordId)) {
      return { error: NextResponse.json({ message: "Unauthorized" }, { status: 401 }) };
    }
  }
  return { lead };
}

export async function POST(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const permission = await ensurePermission(params.id, session.user.id, session.user.role as Role);
  if (permission.error) return permission.error;

  const lead = await prisma.lead.findUnique({ where: { id: params.id } });
  if (!lead) return NextResponse.json({ message: "Lead não encontrado" }, { status: 404 });

  const doc = (lead.cnpj || (lead as Record<string, unknown>)?.documento || "") as string;
  const normalizedDoc = typeof doc === "string" ? doc.replace(/\D+/g, "") : "";
  console.log("[ENRICHMENT_REQUEST]", { doc: normalizedDoc, leadId: lead.id });

  try {
    const suggestions = await fetchExternalEnrichmentForLead(lead);
    // persist as pending (dedupe by type/value)
    const persisted = await Promise.all(
      suggestions.map(async (sugg) => {
        const existing = await prisma.leadEnrichmentSuggestion.findFirst({
          where: { leadId: params.id, type: sugg.type, value: String(sugg.value) },
        });
        if (existing) {
          if (existing.status !== "ACCEPTED") {
            await prisma.leadEnrichmentSuggestion.update({
              where: { id: existing.id },
              data: { status: "PENDING", source: sugg.source },
            });
          }
          return existing;
        }
        return prisma.leadEnrichmentSuggestion.create({
          data: {
            leadId: params.id,
            type: sugg.type,
            source: sugg.source,
            value: typeof sugg.value === "string" ? sugg.value : JSON.stringify(sugg.value),
            status: "PENDING",
          },
        });
      }),
    );
    const normalized: EnrichmentSuggestion[] = persisted.map((p) => ({
      id: p.id,
      type: p.type as EnrichmentSuggestion["type"],
      label: p.type,
      value: p.value,
      source: p.source,
      applied: p.status === "ACCEPTED",
      ignored: p.status === "REJECTED",
    }));
    console.log("[ENRICHMENT_RESPONSE]", { doc: normalizedDoc, suggestionsCount: normalized.length });
    if (normalized.length === 0) {
      return NextResponse.json({ success: true, suggestions: [], reason: "NOT_FOUND" });
    }
    return NextResponse.json({ success: true, suggestions: normalized });
  } catch (err: unknown) {
    const error = err as { code?: string };
    if (error?.code === "ENRICHMENT_NOT_CONFIGURED") {
      return NextResponse.json({ message: "Enriquecimento não configurado" }, { status: 400 });
    }
    console.error("[ENRICHMENT_ERROR]", err);
    return NextResponse.json(
      { success: false, message: "Falha ao consultar serviços de enriquecimento" },
      { status: 500 },
    );
  }
}
