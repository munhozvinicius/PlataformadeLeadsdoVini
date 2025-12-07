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

export async function getManagedOfficeIds(userId: string): Promise<string[]> {
  const [managerEntries, businessManagerOffices] = await Promise.all([
    prisma.managerOffice.findMany({
      where: { managerId: userId },
      select: { officeRecordId: true },
    }),
    prisma.officeRecord.findMany({
      where: { businessManagerId: userId },
      select: { id: true },
    })
  ]);

  const ids = new Set([
    ...managerEntries.map((e) => e.officeRecordId),
    ...businessManagerOffices.map((o) => o.id)
  ]);

  return Array.from(ids);
}

export async function assignManagedOffices(userId: string, officeRecordIds: string[]) {
  await prisma.managerOffice.deleteMany({ where: { managerId: userId } });
  if (officeRecordIds.length === 0) return;
  await prisma.managerOffice.createMany({
    data: officeRecordIds.map((officeRecordId) => ({ managerId: userId, officeRecordId })),
  });
}

export async function buildUsersFilter(role: Role, userId: string): Promise<Prisma.UserWhereInput | undefined> {
  if (role === Role.MASTER || role === Role.GERENTE_SENIOR) {
    return undefined;
  }
  if (role === Role.GERENTE_NEGOCIOS) {
    const managedOfficeIds = await getManagedOfficeIds(userId);
    if (!managedOfficeIds.length) {
      return { id: userId };
    }
    const owners = await prisma.user.findMany({
      where: {
        role: Role.PROPRIETARIO,
        officeRecordId: { in: managedOfficeIds },
      },
      select: { id: true },
    });
    const ownerIds = owners.map((owner) => owner.id);
    return {
      OR: [
        { officeRecordId: { in: managedOfficeIds } },
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

export async function ensureUserOffice(userId: string, office: Office) {
  await prisma.userOffice.upsert({
    where: {
      userId_office: {
        userId,
        office,
      },
    },
    update: {},
    create: {
      userId,
      office,
    },
  });
}
