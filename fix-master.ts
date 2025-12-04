// @ts-nocheck
import { PrismaClient, Profile } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const masters = await prisma.user.findMany({
    where: { profile: Profile.MASTER },
    select: { id: true, email: true },
  });

  if (masters.length === 0) {
    console.log("Nenhum usuário MASTER encontrado");
    return;
  }

  for (const master of masters) {
    await prisma.user.update({
      where: { id: master.id },
      data: {
        profile: Profile.MASTER,
        owner: { disconnect: true },
        officeRecord: { disconnect: true },
      },
    });
    console.log(`MASTER ajustado: ${master.id} - ${master.email} (owner/officeRecord limpos)`);
  }
}

main()
  .catch((error) => {
    console.error("Erro no fix-master:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
