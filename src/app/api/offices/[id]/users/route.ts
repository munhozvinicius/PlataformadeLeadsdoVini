export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMaster } from "@/lib/requireMaster";
import { Profile } from "@prisma/client";

type Params = { params: { id: string } };

export async function GET(_req: Request, { params }: Params) {
  const auth = await requireMaster();
  if ("response" in auth) return auth.response;

  const officeId = params.id;
  if (!officeId) {
    return NextResponse.json({ error: "Escritório inválido." }, { status: 400 });
  }

  const [proprietarios, consultores] = await Promise.all([
    prisma.user.findMany({
      where: { officeRecordId: officeId, profile: Profile.PROPRIETARIO },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: { officeRecordId: officeId, profile: Profile.CONSULTOR },
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
