import { PrismaClient, Office, Profile, Role, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

const OFFICE_NAMES: Record<Office, string> = {
  [Office.SAFE_TI]: "Safe TI",
  [Office.JLC_TECH]: "JLC Tech",
};

const PROFILE_BY_ROLE: Record<Role, Profile> = {
  [Role.MASTER]: Profile.MASTER,
  [Role.PROPRIETARIO]: Profile.PROPRIETARIO,
  [Role.CONSULTOR]: Profile.CONSULTOR,
};

const DEFAULT_OFFICE = Office.SAFE_TI;

function profileFromRole(role?: Role): Profile {
  if (role && PROFILE_BY_ROLE[role]) {
    return PROFILE_BY_ROLE[role];
  }
  return Profile.CONSULTOR;
}

async function ensureOfficeRecords(): Promise<Map<Office, string>> {
  const officeMap = new Map<Office, string>();
  const offices = (Object.values(Office) as Office[]).filter((value) => typeof value === "string");
  for (const office of offices) {
    const name = OFFICE_NAMES[office] ?? office;
    const record = await prisma.officeRecord.upsert({
      where: { office },
      create: { office, name },
      update: { name },
    });
    officeMap.set(office, record.id);
  }
  return officeMap;
}

async function main() {
  console.log("🚧 Iniciando saneamento de usuários...");
  const officeRecords = await ensureOfficeRecords();
  const users = await prisma.user.findMany({
    select: {
      id: true,
      role: true,
      profile: true,
      office: true,
      officeRecord: { select: { id: true, office: true } },
    },
  });

  for (const user of users) {
    const updates: Prisma.UserUpdateInput = {};
    const appliedChanges: string[] = [];

    if (!user.profile) {
      const derived = profileFromRole(user.role);
      updates.profile = derived;
      appliedChanges.push(`profile=${derived}`);
    }

    const targetOffice = user.office ?? DEFAULT_OFFICE;
    if (!user.office) {
      updates.office = DEFAULT_OFFICE;
      appliedChanges.push(`office=${DEFAULT_OFFICE}`);
    }

    const officeRecordId = officeRecords.get(targetOffice);
    if (!officeRecordId) {
      console.warn(`⚠️  Escritório não encontrado para ${targetOffice}, pulando usuário ${user.id}`);
      continue;
    }

    if (user.officeRecord?.id !== officeRecordId) {
      updates.officeRecord = { connect: { id: officeRecordId } };
      appliedChanges.push(`officeRecord=${officeRecordId}`);
    }

    if (Object.keys(updates).length > 0) {
      await prisma.user.update({ where: { id: user.id }, data: updates });
      console.log(`✨ Usuário ${user.id} atualizado (${appliedChanges.join(", ")})`);
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
