import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== Role.CONSULTOR) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const leads = await prisma.lead.findMany({
    where: { consultorId: session.user.id },
    include: { campanha: true },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(leads);
}
