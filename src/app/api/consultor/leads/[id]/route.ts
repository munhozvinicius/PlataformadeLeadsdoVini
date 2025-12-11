export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LeadStatus, Role, Prisma } from "@prisma/client";
import { getOwnerTeamIds } from "@/lib/auth-helpers";

type Params = { params: { id: string } };

export async function PATCH(req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { status, observacao, addTelefone, site, email, contatoPrincipal } = body;
  if (!status && !addTelefone && !site && !email && !contatoPrincipal) {
    return NextResponse.json({ message: "Nada para atualizar" }, { status: 400 });
  }

  if (status) {
    const allowed = Object.values(LeadStatus).includes(status);
    if (!allowed) return NextResponse.json({ message: "Status inválido" }, { status: 400 });
  }

  const leadWhere: Prisma.LeadWhereInput = { id: params.id };
  if (session.user.role === Role.CONSULTOR) {
    leadWhere.consultorId = session.user.id;
  } else if (session.user.role === Role.PROPRIETARIO) {
    const allowedIds = await getOwnerTeamIds(session.user.id);
    leadWhere.consultorId = { in: allowedIds };
  }

  const lead = await prisma.lead.findFirst({ where: leadWhere });
  if (!lead) {
    return NextResponse.json({ message: "Lead não encontrado" }, { status: 404 });
  }

  // Atualizações complementares (telefones, site, email, contato)
  const dataUpdate: Prisma.LeadUpdateInput = {};
  const notes: string[] = [];
  if (status) {
    dataUpdate.status = status;
    dataUpdate.isWorked = true;
    dataUpdate.lastStatusChangeAt = new Date();
    dataUpdate.lastActivityAt = new Date();
    dataUpdate.lastInteractionAt = new Date();
    dataUpdate.interactionCount = (lead.interactionCount ?? 0) + 1;
    dataUpdate.lastOutcomeNote = observacao ?? lead.lastOutcomeNote ?? null;
  }
  if (addTelefone?.valor && addTelefone?.rotulo) {
    const existing = Array.isArray(lead.telefones) ? (lead.telefones as Prisma.JsonArray) : [];
    const updated = [...existing, { rotulo: addTelefone.rotulo, valor: addTelefone.valor }];
    dataUpdate.telefones = updated as Prisma.JsonArray;
    notes.push(`Telefone adicionado: ${addTelefone.rotulo} - ${addTelefone.valor}`);
  }
  if (site) {
    dataUpdate.site = site;
    notes.push(`Site atualizado para ${site}`);
  }
  if (email) {
    const emails = new Set<string>(lead.emails ?? []);
    emails.add(email);
    dataUpdate.emails = Array.from(emails);
    notes.push(`Email atualizado/adicionado: ${email}`);
  }
  if (contatoPrincipal?.nome) {
    dataUpdate.contatoPrincipal = contatoPrincipal;
    notes.push(`Contato principal atualizado: ${contatoPrincipal.nome}`);
  }

  const historicoAtual: Record<string, unknown>[] = Array.isArray(lead.historico)
    ? (lead.historico as Record<string, unknown>[])
    : [];
  if (status) {
    historicoAtual.push({
      tipo: "ATUALIZACAO_CONSULTOR",
      status,
      observacao: observacao ?? null,
      em: new Date().toISOString(),
    });
  }

  await prisma.lead.update({
    where: { id: params.id },
    data: {
      ...dataUpdate,
      historico: status ? (historicoAtual as Prisma.InputJsonValue) : (lead.historico ?? Prisma.JsonNull),
    },
  });

  // Cria Activity para mudanças de status ou dados
  const activityNotes = observacao || notes.join(" | ");
  if (status || notes.length > 0) {
    await prisma.leadActivity.create({
      data: {
        leadId: lead.id,
        userId: session.user.id,
        campaignId: lead.campanhaId,
        activityType: status ? "STATUS_CHANGE" : "ATUALIZACAO_DADOS",
        note: activityNotes || "Atualização de lead",
        stageBefore: status ? lead.status : lead.status,
        stageAfter: status ? status : lead.status,
      },
    });
  }

  return NextResponse.json({ ok: true });
}
