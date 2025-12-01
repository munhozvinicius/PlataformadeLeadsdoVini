/* eslint-disable no-console */
const { PrismaClient, Role, Escritorio } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

const rawUsers = [
  {
    escritorio: Escritorio.SAFE_TI,
    name: "JULIANA DE JESUS BARBOSA",
    email: "julianabarbosa@safeti.com.br",
    role: Role.CONSULTOR,
    password: "Vivo@2025",
    ownerEmail: "carlosjudice@safeti.com.br",
  },
  {
    escritorio: Escritorio.SAFE_TI,
    name: "CARLOS EDUARDO JUDICE MARIA",
    email: "carlosjudice@safeti.com.br",
    role: Role.OWNER,
    password: "Vivo@2025",
  },
  {
    escritorio: Escritorio.JLC_TECH,
    name: "JULIANA LOSEVICIENE CARVALHO",
    email: "juliana@jlctech.com.br",
    role: Role.OWNER,
    password: "Vivo@2025",
  },
  {
    escritorio: Escritorio.JLC_TECH,
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
    { code: Escritorio.JLC_TECH, name: "JLC Tech" },
    { code: Escritorio.SAFE_TI, name: "Safe TI" },
  ];
  const officeIds = {};
  for (const office of offices) {
    const o = await prisma.office.upsert({
      where: { code: office.code },
      update: { name: office.name },
      create: { code: office.code, name: office.name },
    });
    officeIds[office.code] = o.id;
  }

  // Cria/atualiza owners primeiro
  const owners = {};
  for (const u of rawUsers.filter((u) => u.role === Role.OWNER)) {
    const hashed = await bcrypt.hash(u.password, 10);
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {
        name: u.name,
        password: hashed,
        escritorio: u.escritorio,
        role: u.role,
        officeId: officeIds[u.escritorio],
      },
      create: {
        name: u.name,
        email: u.email,
        password: hashed,
        escritorio: u.escritorio,
        role: u.role,
        officeId: officeIds[u.escritorio],
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
        escritorio: u.escritorio,
        role: u.role,
        ownerId,
      },
      create: {
        name: u.name,
        email: u.email,
        password: hashed,
        escritorio: u.escritorio,
        role: u.role,
        ownerId,
        officeId: officeIds[u.escritorio],
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
