import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

type Params = { params: { id: string } };

export async function GET(_req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role === Role.CONSULTOR) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const campanhaId = params.id;
  const leads = await prisma.lead.findMany({
    where: { campanhaId },
    include: { consultor: true },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(leads);
}
