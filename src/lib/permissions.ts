import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

export type AuthenticatedUser = {
  id: string;
  role: Role;
  officeRecordId?: string | null;
  managedOfficeIds: string[];
};

async function getCampaignOfficeIds(campaignId: string): Promise<Set<string>> {
  const leads = await prisma.lead.findMany({
    where: { campanhaId: campaignId, officeId: { not: null } },
    select: { officeId: true },
  });
  return new Set(leads.map((lead) => lead.officeId!).filter(Boolean));
}

export async function getSessionUserWithOffices(): Promise<AuthenticatedUser | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.role) return null;

  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, officeRecordId: true },
  });
  if (!dbUser) return null;

  const managed = await prisma.managerOffice.findMany({
    where: { managerId: session.user.id },
    select: { officeRecordId: true },
  });

  return {
    id: dbUser.id,
    role: dbUser.role,
    officeRecordId: dbUser.officeRecordId ?? null,
    managedOfficeIds: managed.map((entry) => entry.officeRecordId),
  };
}

function hasOfficeAccess(user: AuthenticatedUser, officeIds: Set<string>): boolean {
  if (officeIds.size === 0) return false;
  if (user.role === Role.MASTER || user.role === Role.GERENTE_SENIOR) return true;
  if (user.role === Role.GERENTE_NEGOCIOS) {
    return Array.from(officeIds).some((id) => user.managedOfficeIds.includes(id));
  }
  if (user.role === Role.PROPRIETARIO) {
    return user.officeRecordId ? officeIds.has(user.officeRecordId) : false;
  }
  return false;
}

export async function canManageCampaign(user: AuthenticatedUser, campaignId: string): Promise<boolean> {
  if (user.role === Role.MASTER || user.role === Role.GERENTE_SENIOR) return true;
  const campaignOffices = await getCampaignOfficeIds(campaignId);
  return hasOfficeAccess(user, campaignOffices);
}

export async function canDistributeLeads(
  user: AuthenticatedUser,
  campaignId: string,
  officeId?: string | null
): Promise<boolean> {
  if (user.role === Role.MASTER || user.role === Role.GERENTE_SENIOR) return true;
  if (user.role === Role.CONSULTOR) return false;
  if (officeId) {
    return hasOfficeAccess(user, new Set([officeId]));
  }
  const campaignOffices = await getCampaignOfficeIds(campaignId);
  return hasOfficeAccess(user, campaignOffices);
}

export async function canRecaptureLeads(
  user: AuthenticatedUser,
  campaignId: string,
  officeId?: string | null
): Promise<boolean> {
  if (user.role === Role.MASTER || user.role === Role.GERENTE_SENIOR) return true;
  if (user.role === Role.CONSULTOR) return false;
  if (officeId) {
    return hasOfficeAccess(user, new Set([officeId]));
  }
  const campaignOffices = await getCampaignOfficeIds(campaignId);
  return hasOfficeAccess(user, campaignOffices);
}

export function roleCanImport(user: AuthenticatedUser): boolean {
  return user.role === Role.MASTER || user.role === Role.GERENTE_SENIOR;
}

// TODO (Etapa 2/3/4): reutilizar estes helpers nas telas de campanha (abas) e na distribuição/repescagem avançadas.
