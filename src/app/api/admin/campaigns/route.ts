export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-helpers";

export async function GET() {
  const sessionUser = await getSessionUser();
  if (!sessionUser || sessionUser.role !== "MASTER") {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const campaigns = await prisma.campanha.findMany({
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(campaigns);
}

export async function POST(req: Request) {
  const sessionUser = await getSessionUser();
  if (!sessionUser || sessionUser.role !== "MASTER") {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { name, description } = await req.json();
  if (!name) {
    return NextResponse.json({ message: "Name is required" }, { status: 400 });
  }

  const campaign = await prisma.campanha.create({
    data: {
      nome: name,
      descricao: description,
      createdById: sessionUser.id,
      status: "ATIVA", // Default status
    },
  });

  return NextResponse.json(campaign, { status: 201 });
}
