// @ts-nocheck

import { PrismaClient, Office, Profile, Role, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

const OFFICE_NAMES: Record<Office, string> = {
  [Office.SAFE_TI]: "Safe TI",
  [Office.JLC_TECH]: "JLC Tech",
};

const PROFILE_BY_ROLE: Partial<Record<Role, Profile>> = {
  [Role.MASTER]: Profile.MASTER,
  [Role.PROPRIETARIO]: Profile.PROPRIETARIO,
  [Role.CONSULTOR]: Profile.CONSULTOR,
  [Role.GERENTE_NEGOCIOS]: Profile.GERENTE_NEGOCIOS,
  [Role.GERENTE_SENIOR]: Profile.GERENTE_SENIOR,
};

const DEFAULT_OFFICE = Office.SAFE_TI;

function normalizeRole(role?: Role | string | null): Role {
  if (role === ("GERENTE_CONTAS" as unknown as Role)) {
    return Role.GERENTE_NEGOCIOS;
  }
  if (role && Object.values(Role).includes(role as Role)) {
    return role as Role;
  }
  return Role.CONSULTOR;
}

function profileFromRole(role?: Role): Profile {
  const normalized = normalizeRole(role);
  if (PROFILE_BY_ROLE[normalized]) {
    return PROFILE_BY_ROLE[normalized] as Profile;
  }
  return Profile.CONSULTOR;
}

async function ensureOfficeRecords(): Promise<Map<Office, string>> {
  const officeMap = new Map<Office, string>();
  const offices = (Object.values(Office) as Office[]).filter((value) => typeof value === "string");
  for (const office of offices) {
    const name = OFFICE_NAMES[office] ?? office;
    const existing = await prisma.officeRecord.findUnique({ where: { code: office } });
    let record = existing;
    if (existing) {
      if (existing.name !== name || existing.office !== office) {
        record = await prisma.officeRecord.update({
          where: { code: office },
          data: { name, office },
        });
      }
    } else {
      record = await prisma.officeRecord.create({
        data: { office, code: office, name },
      });
    }
    officeMap.set(office, record.id);
  }
  return officeMap;
}

type RawUser = {
  _id: string;
  role?: Role | null;
  office?: Office | null;
  profile?: Profile | null;
  officeRecord?: { id?: string };
};

async function main() {
  console.log("🚧 Iniciando saneamento de usuários...");
  const officeRecords = await ensureOfficeRecords();
  const rawUsersResponse = (await prisma.$runCommandRaw({
    aggregate: "User",
    pipeline: [
      {
        $project: {
          _id: 1,
          role: 1,
          profile: 1,
          office: 1,
          officeRecord: 1,
        },
      },
    ],
    cursor: {},
  })) as unknown as {
    cursor: { firstBatch: RawUser[]; id?: number };
  };
  const rawUsers = rawUsersResponse.cursor.firstBatch;

  for (const user of rawUsers) {
    const updates: Prisma.UserUpdateInput = {};
    const appliedChanges: string[] = [];

    const rawId = user._id as unknown;
    const userId =
      typeof rawId === "string"
        ? rawId
        : typeof rawId === "object" && rawId && "$oid" in rawId
        ? rawId.$oid
        : rawId?.toString?.() ?? String(rawId);
    const normalizedRole = normalizeRole(user.role as Role | string | null);
    if (user.role !== normalizedRole) {
      updates.role = normalizedRole;
      appliedChanges.push(`role=${normalizedRole}`);
    }

    const derivedProfile = profileFromRole(normalizedRole);
    updates.profile = derivedProfile;
    appliedChanges.push(`profile=${derivedProfile}`);

    const targetOffice = user.office ?? DEFAULT_OFFICE;
    if (user.office !== targetOffice) {
      updates.office = targetOffice;
      appliedChanges.push(`office=${targetOffice}`);
    }

    const officeRecordId = officeRecords.get(targetOffice);
    if (!officeRecordId) {
      console.warn(`⚠️  Escritório não encontrado para ${targetOffice}, pulando usuário ${userId}`);
      continue;
    }

    if (user.officeRecord?.id !== officeRecordId) {
      updates.officeRecord = { connect: { id: officeRecordId } };
      appliedChanges.push(`officeRecord=${officeRecordId}`);
    }

    if (Object.keys(updates).length > 0) {
      await prisma.user.update({ where: { id: userId }, data: updates });
      console.log(`✨ Usuário ${userId} atualizado (${appliedChanges.join(", ")})`);
    }
  }

  console.log("🔍 Validando leads de owners/consultores...");
  const leads = await prisma.lead.findMany({
    select: { id: true, ownerId: true, consultorId: true },
  });
  const ownerIds = new Set(leads.filter((lead) => lead.ownerId).map((lead) => lead.ownerId!));
  const consultantIds = new Set(leads.filter((lead) => lead.consultorId).map((lead) => lead.consultorId!));

  const existingOwners = await prisma.user.findMany({
    where: { id: { in: Array.from(ownerIds) } },
    select: { id: true },
  });
  const existingConsultants = await prisma.user.findMany({
    where: { id: { in: Array.from(consultantIds) } },
    select: { id: true },
  });

  const missingOwners = Array.from(ownerIds).filter(
    (id) => !existingOwners.some((user) => user.id === id)
  );
  const missingConsultants = Array.from(consultantIds).filter(
    (id) => !existingConsultants.some((user) => user.id === id)
  );

  console.log(`🧾 Leads com owner inválido: ${missingOwners.length}`);
  console.log(`🧾 Leads com consultor inválido: ${missingConsultants.length}`);
  console.log("✅ Saneamento concluído.");
}

main()
  .catch((error) => {
    console.error("❌ Erro ao executar o script:", error);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
