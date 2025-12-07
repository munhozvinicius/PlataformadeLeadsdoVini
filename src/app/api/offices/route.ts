export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { slugifyOfficeCode } from "@/lib/officeSlug";
import {
  buildOfficeResponse,
  getOfficeUserCounts,
  normalizeOptionalString,
} from "@/app/api/offices/helpers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Role } from "@prisma/client";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { role, id: userId } = session.user;

  // Master e Gerente Sênior veem tudo
  let whereClause = {};

  if (role === Role.GERENTE_NEGOCIOS) {
    whereClause = { businessManagerId: userId };
  } else if (role === Role.PROPRIETARIO) {
    whereClause = { ownerId: userId };
  } else if (role !== Role.MASTER && role !== Role.GERENTE_SENIOR) {
    // Consultor não vê lista de escritórios (ou vê só o dele? Normalmente não precisa listar na admin)
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const offices = await prisma.officeRecord.findMany({
    where: whereClause,
    select: {
      id: true,
      name: true,
      code: true,
      region: true,
      uf: true,
      city: true,
      notes: true,
      active: true,
      seniorManagerId: true,
      businessManagerId: true,
      ownerId: true,
      seniorManager: { select: { id: true, name: true, email: true } },
      businessManager: { select: { id: true, name: true, email: true } },
      owner: { select: { id: true, name: true, email: true } },
      createdAt: true,
    },
    orderBy: { name: "asc" },
  });

  const counts = await getOfficeUserCounts();
  return NextResponse.json(offices.map((office) => buildOfficeResponse(office, counts)));
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { role, id: userId } = session.user;

  // Apenas Master, Gerente Sênior e Gerente de Negócios podem criar escritórios
  if (role !== Role.MASTER && role !== Role.GERENTE_SENIOR && role !== Role.GERENTE_NEGOCIOS) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const rawCode = typeof body.code === "string" ? body.code.trim() : "";
  const region = normalizeOptionalString(body.region);
  const uf = normalizeOptionalString(body.uf)?.toUpperCase() ?? null;
  const city = normalizeOptionalString(body.city);
  const notes = normalizeOptionalString(body.notes);
  const active = typeof body.active === "boolean" ? body.active : true;

  // Se for GN criando, ele automaticamente se torna o businessManager se não especificado (ou força?)
  // Se for Master/GS, pode definir quem quiser.
  const seniorManagerId = normalizeOptionalString(body.seniorManagerId);
  let businessManagerId = normalizeOptionalString(body.businessManagerId);
  const ownerId = normalizeOptionalString(body.ownerId);

  if (role === Role.GERENTE_NEGOCIOS) {
    // Força o GN atual como gestor do escritório que ele está criando
    businessManagerId = userId;
    // Pode ou não definir seniorManagerId? Geralmente herda ou deixa null.
  }

  if (!name) {
    return NextResponse.json({ error: "Nome do escritório é obrigatório." }, { status: 400 });
  }

  const code = slugifyOfficeCode(rawCode || name);
  if (!code) {
    return NextResponse.json({ error: "Código do escritório é obrigatório." }, { status: 400 });
  }

  const existing = await prisma.officeRecord.findUnique({ where: { code } });
  if (existing) {
    return NextResponse.json({ error: "Código já está em uso." }, { status: 409 });
  }

  const office = await prisma.officeRecord.create({
    data: {
      name,
      code,
      region,
      uf,
      city,
      notes,
      active,
      ...(seniorManagerId ? { seniorManager: { connect: { id: seniorManagerId } } } : {}),
      ...(businessManagerId ? { businessManager: { connect: { id: businessManagerId } } } : {}),
      ...(ownerId ? { owner: { connect: { id: ownerId } } } : {}),
    },
    select: {
      id: true,
      name: true,
      code: true,
      region: true,
      uf: true,
      city: true,
      notes: true,
      active: true,
      seniorManagerId: true,
      businessManagerId: true,
      ownerId: true,
      seniorManager: { select: { id: true, name: true, email: true } },
      businessManager: { select: { id: true, name: true, email: true } },
      owner: { select: { id: true, name: true, email: true } },
      createdAt: true,
    },
  });

  return NextResponse.json(
    buildOfficeResponse(office, new Map([[office.id, { totalUsers: 0, totalProprietarios: 0, totalConsultores: 0 }]])),
    { status: 201 }
  );
}
