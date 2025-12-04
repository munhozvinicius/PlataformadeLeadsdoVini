import { Profile } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type OfficeCounts = {
  totalUsers: number;
  totalProprietarios: number;
  totalConsultores: number;
};

export type OfficeRecordSummary = {
  id: string;
  name: string;
  code: string;
  region: string | null;
  uf: string | null;
  city: string | null;
  notes: string | null;
  active: boolean;
  createdAt: Date;
};

export function normalizeOptionalString(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

const EMPTY_COUNTS: OfficeCounts = {
  totalUsers: 0,
  totalProprietarios: 0,
  totalConsultores: 0,
};

function ensureCounts(map: Map<string, OfficeCounts>, officeId: string) {
  if (!map.has(officeId)) {
    map.set(officeId, { ...EMPTY_COUNTS });
  }
  return map.get(officeId)!;
}

export async function getOfficeUserCounts(targetOfficeId?: string) {
  const where = targetOfficeId ? { officeRecordId: targetOfficeId } : { officeRecordId: { not: null } };

  const [totals, proprietarios, consultores] = await Promise.all([
    prisma.user.groupBy({ by: ["officeRecordId"], where, _count: { _all: true } }),
    prisma.user.groupBy({
      by: ["officeRecordId"],
      where: { ...where, profile: Profile.PROPRIETARIO },
      _count: { _all: true },
    }),
    prisma.user.groupBy({
      by: ["officeRecordId"],
      where: { ...where, profile: Profile.CONSULTOR },
      _count: { _all: true },
    }),
  ]);

  const counts = new Map<string, OfficeCounts>();

  totals.forEach(({ officeRecordId, _count }) => {
    if (!officeRecordId) return;
    ensureCounts(counts, officeRecordId).totalUsers = _count._all;
  });
  proprietarios.forEach(({ officeRecordId, _count }) => {
    if (!officeRecordId) return;
    ensureCounts(counts, officeRecordId).totalProprietarios = _count._all;
  });
  consultores.forEach(({ officeRecordId, _count }) => {
    if (!officeRecordId) return;
    ensureCounts(counts, officeRecordId).totalConsultores = _count._all;
  });

  return counts;
}

export function buildOfficeResponse(office: OfficeRecordSummary, counts: Map<string, OfficeCounts>) {
  const officeCounts = counts.get(office.id) ?? EMPTY_COUNTS;
  return {
    ...office,
    totalUsers: officeCounts.totalUsers,
    totalProprietarios: officeCounts.totalProprietarios,
    totalConsultores: officeCounts.totalConsultores,
  };
}
