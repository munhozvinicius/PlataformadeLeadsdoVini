import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role === Role.CONSULTOR) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  // Fetch user with office context
  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      managedOffices: true,
      ownedOffices: true
    }
  });

  if (!currentUser) return NextResponse.json({ message: "User not found" }, { status: 401 });

  let whereClause = {};

  // Hierarchy Filter
  if (currentUser.role === Role.GERENTE_NEGOCIOS) {
    const officeIds = currentUser.managedOffices.map(o => o.officeRecordId);
    whereClause = {
      officeRecords: {
        some: { id: { in: officeIds } }
      }
    };
  } else if (currentUser.role === Role.PROPRIETARIO) {
    const officeIds = currentUser.ownedOffices.map(o => o.id);
    whereClause = {
      officeRecords: {
        some: { id: { in: officeIds } }
      }
    };
  }
  // Master/GS see all (empty whereClause)

  const campanhas = await prisma.campanha.findMany({
    where: whereClause,
    orderBy: { createdAt: "desc" },
    select: { id: true, nome: true, descricao: true, createdAt: true, officeRecords: { select: { name: true } } },
  });

  const result = [];
  for (const camp of campanhas) {
    const totalBruto = await prisma.lead.count({ where: { campanhaId: camp.id } });
    const atribuidos = await prisma.lead.count({
      where: { campanhaId: camp.id, consultorId: { not: null } },
    });
    const restantes = await prisma.lead.count({
      where: { campanhaId: camp.id, consultorId: null },
    });
    const consultores = await prisma.lead.groupBy({
      by: ["consultorId"],
      where: { campanhaId: camp.id, consultorId: { not: null } },
      _count: { consultorId: true },
    });
    result.push({
      ...camp,
      totalBruto,
      atribuidos,
      restantes,
      consultoresReceberam: consultores.length,
      estoque: restantes,
    });
  }

  return NextResponse.json(result);
}
