import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { isOfficeAdmin } from "@/lib/authRoles";

const bodySchema = z.object({
  suggestionId: z.string().optional(),
  type: z.string().optional(),
  value: z.string().optional(),
  source: z.string().optional(),
});

type Params = { params: { id: string } };

async function ensurePermission(leadId: string, userId: string, role: Role) {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { consultorId: true, ownerId: true, officeId: true, telefones: true },
  });
  if (!lead) return { error: NextResponse.json({ message: "Lead não encontrado" }, { status: 404 }), lead: null };

  if (role === Role.CONSULTOR && lead.consultorId !== userId) {
    return { error: NextResponse.json({ message: "Unauthorized" }, { status: 401 }), lead: null };
  }
  if (role === Role.PROPRIETARIO && lead.ownerId !== userId) {
    return { error: NextResponse.json({ message: "Unauthorized" }, { status: 401 }), lead: null };
  }
  if (isOfficeAdmin(role) && role !== Role.MASTER) {
    const sessionUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { officeRecordId: true },
    });
    if (!sessionUser?.officeRecordId || (lead.officeId && lead.officeId !== sessionUser.officeRecordId)) {
      return { error: NextResponse.json({ message: "Unauthorized" }, { status: 401 }), lead: null };
    }
  }

  return { lead };
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload inválido", issues: parsed.error.flatten() }, { status: 422 });
  }

  const { lead, error } = await ensurePermission(params.id, session.user.id, session.user.role as Role);
  if (error || !lead) return error;

  let suggestion =
    parsed.data.suggestionId &&
    (await prisma.leadEnrichmentSuggestion.findUnique({ where: { id: parsed.data.suggestionId } }));

  if (!suggestion) {
    if (!parsed.data.type || !parsed.data.value) {
      return NextResponse.json({ message: "Dados insuficientes" }, { status: 400 });
    }
    suggestion = await prisma.leadEnrichmentSuggestion.create({
      data: {
        leadId: params.id,
        type: parsed.data.type,
        value: parsed.data.value,
        source: parsed.data.source ?? "manual_accept",
        status: "PENDING",
      },
    });
  }

  await prisma.leadEnrichmentSuggestion.update({
    where: { id: suggestion.id },
    data: { status: "ACCEPTED" },
  });

  if (suggestion.type === "PHONE") {
    const phones: { rotulo: string; valor: string }[] = Array.isArray(lead.telefones)
      ? (lead.telefones as { rotulo: string; valor: string }[])
      : [];
    const normalize = (v: string) => v.replace(/\D+/g, "");
    const exists = phones.some((p) => normalize(p.valor) === normalize(suggestion!.value));
    if (!exists) {
      phones.push({ rotulo: "Enriquecimento", valor: suggestion.value });
      await prisma.lead.update({
        where: { id: params.id },
        data: { telefones: phones },
      });
    }
  }

  await prisma.leadEvent.create({
    data: {
      leadId: params.id,
      userId: session.user.id,
      type: "ENRICHMENT_ACCEPT",
      payload: { suggestionId: suggestion.id, type: suggestion.type, value: suggestion.value },
    },
  });

  return NextResponse.json({ success: true });
}
