/* eslint-disable no-console */
const { PrismaClient, Role, Office } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

const rawUsers = [
  {
    office: Office.SAFE_TI,
    name: "JULIANA DE JESUS BARBOSA",
    email: "julianabarbosa@safeti.com.br",
    role: Role.CONSULTOR,
    password: "Vivo@2025",
    ownerEmail: "carlosjudice@safeti.com.br",
  },
  {
    office: Office.SAFE_TI,
    name: "CARLOS EDUARDO JUDICE MARIA",
    email: "carlosjudice@safeti.com.br",
    role: Role.PROPRIETARIO,
    password: "Vivo@2025",
  },
  {
    office: Office.JLC_TECH,
    name: "JULIANA LOSEVICIENE CARVALHO",
    email: "juliana@jlctech.com.br",
    role: Role.PROPRIETARIO,
    password: "Vivo@2025",
  },
  {
    office: Office.JLC_TECH,
    name: "JOAO LUCAS PEREIRA DOS SANTOS",
    email: "joaolucas@jlctech.com.br",
    role: Role.CONSULTOR,
    password: "Vivo@2025",
    ownerEmail: "juliana@jlctech.com.br",
  },
];

async function main() {
  console.log("Seeding usuários base...");

  // Offices
  const offices = [
    { code: Office.JLC_TECH, name: "JLC Tech" },
    { code: Office.SAFE_TI, name: "Safe TI" },
  ];
  const officeIds = {};
  for (const office of offices) {
    const o = await prisma.officeRecord.upsert({
      where: { code: office.code },
      update: { name: office.name },
      create: { code: office.code, name: office.name },
    });
    officeIds[office.code] = o.id;
  }

  // Cria/atualiza owners primeiro
  const owners = {};
  for (const u of rawUsers.filter((u) => u.role === Role.PROPRIETARIO)) {
    const hashed = await bcrypt.hash(u.password, 10);
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {
        name: u.name,
        password: hashed,
        office: u.office,
        role: u.role,
        officeId: officeIds[u.office],
      },
      create: {
        name: u.name,
        email: u.email,
        password: hashed,
        office: u.office,
        role: u.role,
        officeId: officeIds[u.office],
      },
    });
    owners[u.email] = user.id;
  }

  // Consultores com owner
  for (const u of rawUsers.filter((u) => u.role === Role.CONSULTOR)) {
    const hashed = await bcrypt.hash(u.password, 10);
    const ownerId = u.ownerEmail ? owners[u.ownerEmail] : null;
    await prisma.user.upsert({
      where: { email: u.email },
      update: {
        name: u.name,
        password: hashed,
        office: u.office,
        role: u.role,
        ownerId,
      },
      create: {
        name: u.name,
        email: u.email,
        password: hashed,
        office: u.office,
        role: u.role,
        ownerId,
        officeId: officeIds[u.office],
      },
    });
  }

  console.log("Seed concluído.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
