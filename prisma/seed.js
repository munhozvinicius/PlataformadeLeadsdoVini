/* eslint-disable no-console */
const { PrismaClient, Role, Office, Profile } = require("@prisma/client");
const bcrypt = require("bcryptjs");
require("dotenv").config({ path: ".env.local" });

const prisma = new PrismaClient();

const rawUsers = [
  {
    office: Office.SAFE_TI,
    name: "VINICUS MUNHOZ",
    email: "munhoz.vinicius@gmail.com",
    role: Role.MASTER,
    password: "Theforce85!!",
  },
  {
    office: Office.SAFE_TI,
    name: "JULIANA RIZO",
    email: "juliana.rizo@telefonica.com",
    role: Role.MASTER,
    password: "Vivo@2025",
  },
  {
    office: Office.SAFE_TI,
    name: "VINICIUS MARTINS",
    email: "vinicius.martins@telefonica.com",
    role: Role.GERENTE_NEGOCIOS,
    password: "Vivo@2025",
  },
  {
    office: Office.SAFE_TI,
    name: "CARLOS JUDICE",
    email: "carlosjudice@safeti.com.br",
    role: Role.PROPRIETARIO,
    password: "Vivo@2025",
  },
  {
    office: Office.SAFE_TI,
    name: "JULIANA BARBOSA",
    email: "julianabarbosa@safeti.com.br",
    role: Role.CONSULTOR,
    password: "Vivo@2025",
    ownerEmail: "carlosjudice@safeti.com.br",
  },
  {
    office: Office.SAFE_TI,
    name: "MARCELO ADAO",
    email: "adao@safeti.com.br",
    role: Role.CONSULTOR,
    password: "Vivo@2025",
    ownerEmail: "carlosjudice@safeti.com.br",
  },
  {
    office: Office.SAFE_TI,
    name: "KAREN LUNGA",
    email: "vendas2@safe-ti.com.br",
    role: Role.CONSULTOR,
    password: "Vivo@2025",
    ownerEmail: "carlosjudice@safeti.com.br",
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
    const code = office.office || office.name;
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
        data: { office: office.office, code, name: office.name },
      });
    }
    officeIds[office.office] = record.id;
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

  // Demais papéis (MASTER, GERENTE_NEGOCIOS etc.)
  for (const u of rawUsers.filter(
    (u) => u.role !== Role.PROPRIETARIO && u.role !== Role.CONSULTOR
  )) {
    const hashed = await bcrypt.hash(u.password, 10);
    const officeConnection = connectOffice(u.office);
    await prisma.user.upsert({
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
