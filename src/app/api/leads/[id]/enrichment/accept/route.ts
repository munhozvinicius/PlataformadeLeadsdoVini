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
    select: {
      consultorId: true,
      ownerId: true,
      officeId: true,
      telefones: true,
      emails: true,
      endereco: true,
      logradouro: true,
      cidade: true,
      estado: true,
      cep: true,
      cnae: true,
      vertical: true,
      externalData: true,
      contatoPrincipal: true,
    },
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
  } else if (suggestion.type === "EMAIL") {
    const emails: string[] = Array.isArray(lead.emails) ? lead.emails : [];
    if (!emails.includes(suggestion.value)) {
      emails.push(String(suggestion.value));
      await prisma.lead.update({ where: { id: params.id }, data: { emails } });
    }
  } else if (suggestion.type === "ADDRESS") {
    let addressValue: Record<string, unknown> = {};
    try {
      addressValue = typeof suggestion.value === "string" ? JSON.parse(suggestion.value) : (suggestion.value as Record<string, unknown>);
    } catch {
      addressValue = { endereco: suggestion.value };
    }
    await prisma.lead.update({
      where: { id: params.id },
      data: {
        endereco: typeof suggestion.value === "string" ? suggestion.value : lead.endereco,
        logradouro: (addressValue.logradouro as string) ?? lead.logradouro,
        cidade: (addressValue.cidade as string) ?? lead.cidade,
        estado: (addressValue.estado as string) ?? lead.estado,
        cep: (addressValue.cep as string) ?? lead.cep,
      },
    });
  } else if (suggestion.type === "CNAE") {
    let cnaeValue: Record<string, unknown> = {};
    try {
      cnaeValue = typeof suggestion.value === "string" ? JSON.parse(suggestion.value) : (suggestion.value as Record<string, unknown>);
    } catch {
      cnaeValue = {};
    }
    await prisma.lead.update({
      where: { id: params.id },
      data: {
        cnae: (cnaeValue.cnae as string) ?? lead.cnae,
        vertical: (cnaeValue.segmento as string) ?? lead.vertical,
      },
    });
  } else if (suggestion.type === "PORTE") {
    await prisma.lead.update({
      where: { id: params.id },
      data: {
        externalData: {
          ...(lead.externalData as Record<string, unknown> | null),
          porte: suggestion.value,
        },
      },
    });
  } else if (suggestion.type === "RESPONSIBLE") {
    let resp: Record<string, unknown> = {};
    try {
      resp = typeof suggestion.value === "string" ? JSON.parse(suggestion.value) : (suggestion.value as Record<string, unknown>);
    } catch {
      resp = { nome: suggestion.value };
    }
    const contatoPayload: { nome?: string | null; cargo?: string | null } = {
      nome:
        typeof resp.nome === "string"
          ? resp.nome
          : (lead.contatoPrincipal as Record<string, unknown> | null)?.nome
            ? String((lead.contatoPrincipal as Record<string, unknown> | null)?.nome)
            : null,
      cargo:
        typeof resp.cargo === "string"
          ? resp.cargo
          : (lead.contatoPrincipal as Record<string, unknown> | null)?.cargo
            ? String((lead.contatoPrincipal as Record<string, unknown> | null)?.cargo)
            : null,
    };
    await prisma.lead.update({
      where: { id: params.id },
      data: {
        contatoPrincipal: contatoPayload,
      },
    });
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
