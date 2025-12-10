import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

export const dynamic = "force-dynamic";

async function canViewOffice(officeId: string, userId: string, role: Role) {
  if (role === Role.MASTER || role === Role.GERENTE_SENIOR) return true;
  if (role === Role.GERENTE_NEGOCIOS) {
    const manager = await prisma.managerOffice.findFirst({
      where: { managerId: userId, officeRecordId: officeId },
      select: { id: true },
    });
    return Boolean(manager);
  }
  return false;
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !session.user.role) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const officeId = params.id;
  const role = session.user.role;

  const allowed = await canViewOffice(officeId, session.user.id, role);
  if (!allowed) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  }

  const [proprietarios, consultores] = await Promise.all([
    prisma.user.findMany({
      where: { officeRecordId: officeId, role: Role.PROPRIETARIO },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: { officeRecordId: officeId, role: Role.CONSULTOR },
      select: {
        id: true,
        name: true,
        email: true,
        owner: { select: { id: true, name: true, email: true } },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  return NextResponse.json({ proprietarios, consultores });
}
