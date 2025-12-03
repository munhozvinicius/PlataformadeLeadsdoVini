export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role === Role.CONSULTOR) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { leadId, consultantId } = await req.json();
  if (!leadId || !consultantId) return NextResponse.json({ message: "leadId e consultantId são obrigatórios" }, { status: 400 });

  await prisma.lead.update({
    where: { id: leadId },
    data: { consultorId: consultantId, isWorked: false },
  });

  return NextResponse.json({ ok: true });
}
