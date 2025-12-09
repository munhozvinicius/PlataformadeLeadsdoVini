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

  // Defaults: Master/GS sees all
  let whereClause: Record<string, unknown> = {};

  if (role === Role.GERENTE_NEGOCIOS) {
    // GN sees offices they manage via ManagerOffice or direct businessManagerId
    // We need to fetch the user's managed offices first to get the IDs
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { managedOffices: true },
    });

    const managedOfficeIds = user?.managedOffices.map(mo => mo.officeRecordId) || [];

    // Also include if they are directly set as businessManagerId (legacy/fallback)
    whereClause = {
      OR: [
        { businessManagerId: userId },
        { id: { in: managedOfficeIds } }
      ]
    };
  } else if (role === Role.PROPRIETARIO) {
    // Proprietário sees only their owned office(s)
    // Check both 'ownedOffices' relation and 'ownerId' field on OfficeRecord
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { ownedOffices: true },
    });
    const ownedIds = user?.ownedOffices.map(o => o.id) || [];

    whereClause = {
      OR: [
        { ownerId: userId },
        { id: { in: ownedIds } }
      ]
    };
  } else if (role !== Role.MASTER && role !== Role.GERENTE_SENIOR) {
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

  // Master, Senior, GN can create. Proprietarios usually cannot create their own office? 
  // Maybe Proprietarios receive an Invite but usually Admin creates the office.
  // Sticking to MASTER, GS, GN for now.
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

  // Transaction to create office and link GN if needed
  const office = await prisma.$transaction(async (tx) => {
    const newOffice = await tx.officeRecord.create({
      data: {
        name,
        code,
        region,
        uf,
        city,
        notes,
        active,
        ...(seniorManagerId ? { seniorManager: { connect: { id: seniorManagerId } } } : {}),
        // businessManagerId might be set here, but we also want to add to ManagerOffice table for GN
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

    // If Creator is GN, link them to the office in ManagerOffice table if not already
    if (role === Role.GERENTE_NEGOCIOS) {
      // Link creator GN to this office
      await tx.managerOffice.create({
        data: {
          managerId: userId,
          officeRecordId: newOffice.id
        }
      });

      // If a different businessManagerId was passed, also link them?
      // For now, assume if GN creates, they manage it.
    }

    // Also, if businessManagerId was explicitly passed (even by Master), we should link in ManagerOffice
    if (businessManagerId) {
      // Check if exists to avoid duplicate if same as userId above
      const exists = await tx.managerOffice.findUnique({
        where: {
          managerId_officeRecordId: {
            managerId: businessManagerId,
            officeRecordId: newOffice.id
          }
        }
      });
      if (!exists) {
        await tx.managerOffice.create({
          data: { managerId: businessManagerId, officeRecordId: newOffice.id }
        });
      }
    }

    return newOffice;
  });

  return NextResponse.json(
    buildOfficeResponse(office, new Map([[office.id, { totalUsers: 0, totalProprietarios: 0, totalConsultores: 0 }]])),
    { status: 201 }
  );
}
