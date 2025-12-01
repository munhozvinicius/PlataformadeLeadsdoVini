import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { Escritorio, Role } from "@prisma/client";

let masterSeeded = false;

// Ensures there is at least one MASTER user in the database.
// Falls back to default credentials if envs are missing to avoid lockout.
export async function ensureMasterUser() {
  if (masterSeeded) return;

  const email = process.env.MASTER_EMAIL || "munhoz.vinicius@gmail.com";
  const password = process.env.MASTER_PASSWORD || "Theforce85!!";

  const existingByEmail = await prisma.user.findUnique({ where: { email } });
  if (existingByEmail) {
    const updates: Partial<typeof existingByEmail> = {};
    if (existingByEmail.role !== Role.MASTER) {
      updates.role = Role.MASTER;
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
      escritorio: Escritorio.JLC_TECH,
    },
  });
  masterSeeded = true;
}
