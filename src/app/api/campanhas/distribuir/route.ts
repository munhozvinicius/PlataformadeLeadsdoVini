export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LeadStatus, Role } from "@prisma/client";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);

  // 1. Basic Auth Check
  if (!session?.user || session.user.role === Role.CONSULTOR) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { campanhaId, consultorId, quantidade } = await req.json();

  if (!campanhaId || !consultorId || !quantidade || quantidade <= 0) {
    return NextResponse.json({ message: "Dados inválidos: ID da campanha, ID do consultor e quantidade positiva são obrigatórios." }, { status: 400 });
  }

  // 2. Fetch User with Hierarchy Context
  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      managedOffices: true, // For GN
      ownedOffices: true,   // For Proprietario
    }
  });

  if (!currentUser) return NextResponse.json({ message: "Usuário não encontrado" }, { status: 401 });

  // 3. Fetch Target Consultant to Validate Scope
  const targetConsultant = await prisma.user.findUnique({
    where: { id: consultorId },
    select: { id: true, officeRecordId: true, role: true, ownerId: true }
  });

  if (!targetConsultant) {
    return NextResponse.json({ message: "Consultor de destino não encontrado" }, { status: 404 });
  }

  if (targetConsultant.role !== Role.CONSULTOR) {
    return NextResponse.json({ message: "O usuário de destino não é um consultor." }, { status: 400 });
  }

  // 3.5 Check Campaign Scope (Office Match)
  // Ensure the consultant is in an office that participates in this campaign
  const campaign = await prisma.campanha.findUnique({
    where: { id: campanhaId },
    select: { officeIDs: true }
  });

  if (!campaign) {
    return NextResponse.json({ message: "Campanha não encontrada." }, { status: 404 });
  }

  // If campaign has specific offices assigned, enforce it.
  // If officeIDs is empty, maybe it's a global/legacy campaign? allow all or strict?
  // User implies strict: "selecionado os escritorios... quem terá acesso"
  if (campaign.officeIDs && campaign.officeIDs.length > 0) {
    if (!targetConsultant.officeRecordId || !campaign.officeIDs.includes(targetConsultant.officeRecordId)) {
      return NextResponse.json({
        message: "Este consultor não pertence a nenhum escritório participante desta campanha."
      }, { status: 400 });
    }
  }

  // 4. Permission Logic matches "User Rules"
  // Master/GS: Global access
  const isGlobalAdmin = currentUser.role === Role.MASTER || currentUser.role === Role.GERENTE_SENIOR;

  if (!isGlobalAdmin) {
    let hasAccess = false;

    // GN: Check if consultant is in one of the managed offices
    if (currentUser.role === Role.GERENTE_NEGOCIOS) {
      // GN manages offices via managedOffices table or direct hierarchy?
      // Schema: managedOffices ManagerOffice[]
      // ManagerOffice: { managerId, officeRecordId }
      const managedOfficeIds = currentUser.managedOffices.map(mo => mo.officeRecordId);

      if (targetConsultant.officeRecordId && managedOfficeIds.includes(targetConsultant.officeRecordId)) {
        hasAccess = true;
      }
    }

    // Owner: Check if consultant is in owned office or directly owned
    if (currentUser.role === Role.PROPRIETARIO) {
      // Schema: ownedOffices OfficeRecord[]
      const ownedOfficeIds = currentUser.ownedOffices.map(o => o.id);

      // Check Office Match
      if (targetConsultant.officeRecordId && ownedOfficeIds.includes(targetConsultant.officeRecordId)) {
        hasAccess = true;
      }
      // Check Direct Ownership
      if (targetConsultant.ownerId === currentUser.id) {
        hasAccess = true;
      }
    }

    if (!hasAccess) {
      return NextResponse.json({ message: "Permissão negada: Você não gerencia este consultor." }, { status: 403 });
    }
  }

  // 5. Check Available Leads
  // We explicitly only distribute leads that are NOVO and UNASSIGNED (consultorId: null)
  const leadsNovos = await prisma.lead.findMany({
    where: {
      campanhaId,
      status: LeadStatus.NOVO,
      consultorId: null
    },
    orderBy: { createdAt: "asc" },
    take: quantidade,
    select: { id: true },
  });

  if (leadsNovos.length === 0) {
    return NextResponse.json({ message: "Não há leads 'NOVOS' e não atribuídos disponíveis nesta campanha para distribuição." }, { status: 400 });
  }

  // 6. Perform Distribution
  await prisma.lead.updateMany({
    where: { id: { in: leadsNovos.map((l) => l.id) } },
    data: {
      consultorId,
      status: LeadStatus.NOVO,
      isWorked: false,
      assignedToId: consultorId, // Redundant but good for tracking
      lastStatusChangeAt: new Date(),
      // Reset interaction fields
      nextFollowUpAt: null,
      nextStepNote: null,
      lastOutcomeCode: null,
      lastOutcomeLabel: null,
      lastOutcomeNote: null,
      lastActivityAt: null,
      lastInteractionAt: null,
    },
  });

  // 7. Log Distribution (Optional but good for history)
  try {
    await prisma.distributionLog.create({
      data: {
        campaignId: campanhaId,
        adminId: currentUser.id,
        consultantId: consultorId,
        leadIds: leadsNovos.map(l => l.id),
        rulesApplied: `Manual Batch Distribution (${leadsNovos.length})`
      }
    });
  } catch (e) {
    console.error("Failed to create log", e);
  }

  return NextResponse.json({ assigned: leadsNovos.length, atribuídos: leadsNovos.length });
}
