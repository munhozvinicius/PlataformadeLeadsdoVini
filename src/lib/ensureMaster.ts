import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { Office, Role, Profile, Prisma } from "@prisma/client";
import { slugifyOfficeCode } from "@/lib/officeSlug";

let masterSeeded = false;

async function ensureOffices() {
  const offices = [
    { office: Office.JLC_TECH, name: "JLC Tech" },
    { office: Office.SAFE_TI, name: "Safe TI" },
  ];
  const records: Record<Office, { id: string }> = {} as Record<Office, { id: string }>;
  for (const office of offices) {
    const code = slugifyOfficeCode(office.name);
    const existing = await prisma.officeRecord.findUnique({ where: { code } });
    let record = existing;
    if (existing) {
      if (existing.name !== office.name || existing.office !== office.office) {
        record = await prisma.officeRecord.update({
          where: { code },
          data: { name: office.name, office: office.office },
        });
      }
    } else {
      record = await prisma.officeRecord.create({
        data: { code, office: office.office, name: office.name },
      });
    }
    records[office.office] = record;
  }
  return records;
}

// Ensures there is at least one MASTER user in the database.
// Falls back to default credentials if envs are missing to avoid lockout.
export async function ensureMasterUser() {
  if (masterSeeded) return;

  const officeRecords = await ensureOffices();
  const defaultOfficeCode = Office.JLC_TECH;
  const defaultOfficeRecord = officeRecords[defaultOfficeCode];
  const defaultOfficeRecordConnect = defaultOfficeRecord?.id
    ? { connect: { id: defaultOfficeRecord.id } }
    : undefined;

  const email = process.env.MASTER_EMAIL || "munhoz.vinicius@gmail.com";
  const password = process.env.MASTER_PASSWORD || "Theforce85!!";

  const existingByEmail = await prisma.user.findUnique({ where: { email } });
  if (existingByEmail) {
    const updates: Prisma.UserUpdateInput = {};
    if (existingByEmail.role !== Role.MASTER) {
      updates.role = Role.MASTER;
      updates.profile = Profile.MASTER;
      updates.owner = { disconnect: true };
      updates.office = defaultOfficeCode;
      if (defaultOfficeRecordConnect) {
        updates.officeRecord = defaultOfficeRecordConnect;
      }
    }
    const matches = await bcrypt.compare(password, existingByEmail.password);
    if (!matches) {
      updates.password = await bcrypt.hash(password, 10);
    }
    if (Object.keys(updates).length > 0) {
      await prisma.user.update({ where: { id: existingByEmail.id }, data: updates });
    }
    masterSeeded = true;
    return;
  }

  const existingMaster = await prisma.user.findFirst({ where: { role: Role.MASTER } });
  if (existingMaster) {
    masterSeeded = true;
    return;
  }

  const hashed = await bcrypt.hash(password, 10);
  await prisma.user.create({
    data: {
      name: "Vinicius Munhoz",
      email,
      password: hashed,
      role: Role.MASTER,
      profile: Profile.MASTER,
      office: defaultOfficeCode,
      ...(defaultOfficeRecordConnect ? { officeRecord: defaultOfficeRecordConnect } : {}),
      active: true,
    },
  });
  masterSeeded = true;
}
