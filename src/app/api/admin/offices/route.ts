export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { slugifyOfficeCode } from "@/lib/officeSlug";


function canAccessOffices(role?: Role) {
  return role === Role.MASTER || role === Role.GERENTE_SENIOR || role === Role.GERENTE_NEGOCIOS;
}



export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessOffices(session.user.role)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const role = session.user.role;
  let where = {};

  if (role === Role.GERENTE_NEGOCIOS) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { managedOffices: true }
    });
    const officeIds = user?.managedOffices.map(mo => mo.officeRecordId) || [];
    where = { id: { in: officeIds } };
  }

  const offices = await prisma.officeRecord.findMany({
    where,
    include: {
      seniorManager: { select: { id: true, name: true, email: true } },
      businessManager: { select: { id: true, name: true, email: true } },
      owner: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const officeIds: string[] = offices.map((o) => o.id).filter((id): id is string => typeof id === "string");
  const groupedCounts = officeIds.length
    ? await prisma.user.groupBy({
        by: ["officeRecordId", "role"],
        _count: { _all: true },
        where: { officeRecordId: { in: officeIds } },
      })
    : [];

  const countsMap = new Map<string, { total: number; proprietarios: number; consultores: number }>();
  officeIds.forEach((id) => countsMap.set(id, { total: 0, proprietarios: 0, consultores: 0 }));
  groupedCounts.forEach((entry) => {
    if (!entry.officeRecordId) return;
    const bucket = countsMap.get(entry.officeRecordId) ?? { total: 0, proprietarios: 0, consultores: 0 };
    bucket.total += entry._count._all;
    if (entry.role === Role.PROPRIETARIO) bucket.proprietarios += entry._count._all;
    if (entry.role === Role.CONSULTOR) bucket.consultores += entry._count._all;
    countsMap.set(entry.officeRecordId, bucket);
  });

  const response = offices.map((office) => {
    const counts = office.id ? countsMap.get(office.id) ?? { total: 0, proprietarios: 0, consultores: 0 } : { total: 0, proprietarios: 0, consultores: 0 };
    return {
      id: office.id,
      code: office.code,
      name: office.name,
      region: office.region,
      uf: office.uf,
      city: office.city,
      notes: office.notes,
      active: office.active,
      seniorManagerId: office.seniorManagerId,
      businessManagerId: office.businessManagerId,
      ownerId: office.ownerId,
      seniorManager: office.seniorManager,
      businessManager: office.businessManager,
      owner: office.owner,
      createdAt: office.createdAt,
      totalUsers: counts.total,
      totalProprietarios: counts.proprietarios,
      totalConsultores: counts.consultores,
    };
  });

  return NextResponse.json(response);
}



export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !canAccessOffices(session.user.role)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const name = (body.name ?? "").toString().trim();
  if (!name) {
    return NextResponse.json({ message: "Nome do escritório é obrigatório" }, { status: 400 });
  }
  const code = (body.code ?? "").toString().trim() || slugifyOfficeCode(name);
  const data: Parameters<typeof prisma.officeRecord.create>[0]["data"] = {
    code,
    name,
    region: body.region?.toString().trim() || null,
    uf: body.uf?.toString().trim().toUpperCase() || null,
    city: body.city?.toString().trim() || null,
    notes: body.notes?.toString().trim() || null,
    active: typeof body.active === "boolean" ? body.active : true,
  };

  if (body.seniorManagerId) data.seniorManager = { connect: { id: body.seniorManagerId } };
  if (body.businessManagerId) data.businessManager = { connect: { id: body.businessManagerId } };
  if (body.ownerId) data.owner = { connect: { id: body.ownerId } };

  if (session.user.role === Role.GERENTE_NEGOCIOS) {
    data.businessManager = { connect: { id: session.user.id } };
    data.managers = {
      create: { managerId: session.user.id },
    };
  }

  const office = await prisma.officeRecord.create({ data });

  // Sync linked users to this office when provided
  const postOps: Promise<unknown>[] = [];
  if (body.ownerId) {
    postOps.push(
      prisma.user.update({
        where: { id: body.ownerId },
        data: { officeRecord: { connect: { id: office.id } } },
      })
    );
  }
  if (body.businessManagerId && session.user.role !== Role.GERENTE_NEGOCIOS) {
    postOps.push(
      prisma.managerOffice.upsert({
        where: {
          managerId_officeRecordId: { managerId: body.businessManagerId, officeRecordId: office.id },
        },
        create: { managerId: body.businessManagerId, officeRecordId: office.id },
        update: {},
      })
    );
  }
  await Promise.all(postOps);

  return NextResponse.json(office, { status: 201 });
}
