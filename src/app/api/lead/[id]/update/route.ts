export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

type Params = { params: { id: string } };

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role === Role.CONSULTOR) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const allowedFields = ["razaoSocial", "nomeFantasia", "telefone1", "telefone2", "telefone3", "cidade", "estado", "vlFatPresumido", "estrategia", "vertical"];
  const data: Record<string, string | null> = {};
  allowedFields.forEach((field) => {
    if (body[field] !== undefined) data[field] = body[field] || null;
  });

  const updated = await prisma.lead.update({
    where: { id: params.id },
    data,
  });

  return NextResponse.json(updated);
}
