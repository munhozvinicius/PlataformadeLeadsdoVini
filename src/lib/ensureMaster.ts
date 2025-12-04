import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { Office, Role, Prisma } from "@prisma/client";

let masterSeeded = false;

async function ensureOffices() {
  const offices = [
    { code: Office.JLC_TECH, name: "JLC Tech" },
    { code: Office.SAFE_TI, name: "Safe TI" },
  ];
  const records: Record<Office, { id: string }> = {} as Record<Office, { id: string }>;
  for (const office of offices) {
    const record = await prisma.officeRecord.upsert({
      where: { code: office.code },
      update: { name: office.name },
      create: { code: office.code, name: office.name },
    });
    records[office.code] = record;
  }
  return records;
}

// Ensures there is at least one MASTER user in the database.
// Falls back to default credentials if envs are missing to avoid lockout.
export async function ensureMasterUser() {
  if (masterSeeded) return;

  const officeRecords = await ensureOffices();
  const defaultOfficeCode = Office.SAFE_TI;
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
      updates.ownerId = null;
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
      office: defaultOfficeCode,
      ...(defaultOfficeRecordConnect ? { officeRecord: defaultOfficeRecordConnect } : {}),
      active: true,
    },
  });
  masterSeeded = true;
}
