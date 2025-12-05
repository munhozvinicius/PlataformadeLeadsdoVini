export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { slugifyOfficeCode } from "@/lib/officeSlug";
import {
  buildOfficeResponse,
  getOfficeUserCounts,
  normalizeOptionalString,
} from "@/app/api/offices/helpers";
import { requireMaster } from "@/lib/requireMaster";

export async function GET() {
  const auth = await requireMaster();
  if ("response" in auth) return auth.response;

  const offices = await prisma.officeRecord.findMany({
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
  const auth = await requireMaster();
  if ("response" in auth) return auth.response;

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const rawCode = typeof body.code === "string" ? body.code.trim() : "";
  const region = normalizeOptionalString(body.region);
  const uf = normalizeOptionalString(body.uf)?.toUpperCase() ?? null;
  const city = normalizeOptionalString(body.city);
  const notes = normalizeOptionalString(body.notes);
  const active = typeof body.active === "boolean" ? body.active : true;
  const seniorManagerId = normalizeOptionalString(body.seniorManagerId);
  const businessManagerId = normalizeOptionalString(body.businessManagerId);
  const ownerId = normalizeOptionalString(body.ownerId);

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
