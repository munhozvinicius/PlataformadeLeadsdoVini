import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { Role } from "@prisma/client";

export type SessionUser = {
  id: string;
  role: Role;
  email?: string | null;
  name?: string | null;
};

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  return {
    id: session.user.id,
    role: session.user.role as Role,
    email: session.user.email,
    name: session.user.name,
  };
}

export async function getOwnerTeamIds(ownerId: string) {
  const consultants = await prisma.user.findMany({
    where: { ownerId, role: Role.CONSULTOR },
    select: { id: true },
  });
  return [ownerId, ...consultants.map((c) => c.id)];
}

export async function leadsAccessFilter(user: SessionUser) {
  if (user.role === Role.MASTER) return {};
  if (user.role === Role.PROPRIETARIO) {
    const teamIds = await getOwnerTeamIds(user.id);
    return { consultorId: { in: teamIds } };
  }
  return { consultorId: user.id };
}

// Backward compatibility for legacy imports
export const companyAccessFilter = leadsAccessFilter;
