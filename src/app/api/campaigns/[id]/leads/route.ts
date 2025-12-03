export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role, LeadStatus, Prisma } from "@prisma/client";

type Params = { params: { id: string } };

export async function GET(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role === Role.CONSULTOR) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const search = req.nextUrl.searchParams;
  const status = search.get("status") as LeadStatus | null;
  const consultorId = search.get("consultorId");
  const officeId = search.get("officeId");
  const cidade = search.get("cidade");
  const uf = search.get("uf");
  const estrategia = search.get("estrategia");
  const vertical = search.get("vertical");
  const take = Number(search.get("take") ?? 50);
  const skip = Number(search.get("skip") ?? 0);

  const where: Prisma.LeadWhereInput = { campanhaId: params.id };
  if (status) where.status = status;
  if (consultorId) where.consultorId = consultorId;
  if (officeId) where.officeId = officeId;
  if (cidade) where.cidade = { contains: cidade, mode: "insensitive" };
  if (uf) where.estado = { equals: uf, mode: "insensitive" };
  if (estrategia) where.estrategia = { contains: estrategia, mode: "insensitive" };
  if (vertical) where.vertical = { contains: vertical, mode: "insensitive" };

  const [items, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      take,
      skip,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        razaoSocial: true,
        nomeFantasia: true,
        cidade: true,
        estado: true,
        documento: true,
        cnpj: true,
        vlFatPresumido: true,
        telefone1: true,
        telefone2: true,
        telefone3: true,
        logradouro: true,
        territorio: true,
        ofertaMkt: true,
        cep: true,
        numero: true,
        estrategia: true,
      vertical: true,
      status: true,
      consultor: { select: { id: true, name: true, email: true } },
      officeId: true,
    },
  }),
    prisma.lead.count({ where }),
  ]);

  return NextResponse.json({ items, total });
}
