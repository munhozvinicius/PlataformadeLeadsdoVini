import { prisma } from "@/lib/prisma";
import { Office, Prisma, Role } from "@prisma/client";

export function normalizeOfficeCodes(input: unknown): Office[] {
  if (!Array.isArray(input)) return [];
  const officeValues = Object.values(Office) as Office[];
  return input.filter((value): value is Office => officeValues.includes(value));
}

export async function getUserOfficeCodes(userId: string): Promise<Office[]> {
  const entries = await prisma.userOffice.findMany({
    where: { userId },
    select: { office: true },
  });
  return entries.map((entry) => entry.office);
}

export async function assignUserOffices(userId: string, offices: Office[]) {
  await prisma.userOffice.deleteMany({ where: { userId } });
  if (offices.length > 0) {
    await prisma.userOffice.createMany({
      data: offices.map((office) => ({ userId, office })),
    });
  }
}

export async function buildUsersFilter(role: Role, userId: string): Promise<Prisma.UserWhereInput | undefined> {
  if (role === Role.MASTER || role === Role.GERENTE_SENIOR) {
    return undefined;
  }
  if (role === Role.GERENTE_NEGOCIOS) {
    const officeCodes = await getUserOfficeCodes(userId);
    if (!officeCodes.length) {
      return { id: userId };
    }
    const owners = await prisma.user.findMany({
      where: {
        role: Role.PROPRIETARIO,
        offices: { some: { office: { in: officeCodes } } },
      },
      select: { id: true },
    });
    const ownerIds = owners.map((owner) => owner.id);
    return {
      OR: [
        { offices: { some: { office: { in: officeCodes } } } },
        { ownerId: { in: ownerIds } },
      ],
    };
  }
  if (role === Role.PROPRIETARIO) {
    return { OR: [{ id: userId }, { ownerId: userId }] };
  }
  return { id: userId };
}

export function hasOfficeOverlap(a: Office[], b: Office[]): boolean {
  return a.some((office) => b.includes(office));
}
