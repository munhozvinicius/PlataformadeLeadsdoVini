/* eslint-disable no-console */
const { PrismaClient, Role, Office, Profile } = require("@prisma/client");
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
    { office: Office.JLC_TECH, name: "JLC Tech" },
    { office: Office.SAFE_TI, name: "Safe TI" },
  ];
  const officeIds = {};
  for (const office of offices) {
    const o = await prisma.officeRecord.upsert({
      where: { office: office.office },
      update: { name: office.name },
      create: { office: office.office, name: office.name },
    });
    officeIds[office.office] = o.id;
  }

  const connectOffice = (code) => {
    const id = officeIds[code];
    if (!id) return {};
    return { officeRecord: { connect: { id } } };
  };

  // Cria/atualiza owners primeiro
  const owners = {};
  for (const u of rawUsers.filter((u) => u.role === Role.PROPRIETARIO)) {
    const hashed = await bcrypt.hash(u.password, 10);
    const officeConnection = connectOffice(u.office);
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {
        name: u.name,
        password: hashed,
        role: u.role,
        profile: u.role,
        office: u.office,
        ...officeConnection,
      },
      create: {
        name: u.name,
        email: u.email,
        password: hashed,
        role: u.role,
        profile: u.role,
        office: u.office,
        ...officeConnection,
      },
    });
    owners[u.email] = user.id;
  }

  // Consultores com owner
  for (const u of rawUsers.filter((u) => u.role === Role.CONSULTOR)) {
    const hashed = await bcrypt.hash(u.password, 10);
    const ownerId = u.ownerEmail ? owners[u.ownerEmail] : null;
    const officeConnection = connectOffice(u.office);
    await prisma.user.upsert({
      where: { email: u.email },
      update: {
        name: u.name,
        password: hashed,
        role: u.role,
        profile: u.role,
        office: u.office,
        owner: ownerId ? { connect: { id: ownerId } } : undefined,
        ...officeConnection,
      },
      create: {
        name: u.name,
        email: u.email,
        password: hashed,
        role: u.role,
        profile: u.role,
        office: u.office,
        owner: ownerId ? { connect: { id: ownerId } } : undefined,
        ...officeConnection,
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
