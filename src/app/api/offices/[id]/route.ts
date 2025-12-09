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

type Params = { params: { id: string } };

const OFFICE_SELECT = {
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
};

export async function GET(_req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { role, id: userId } = session.user;
  const officeId = params.id;

  // Check permissions found in GET /api/offices/route.ts
  const office = await prisma.officeRecord.findUnique({
    where: { id: officeId },
    select: OFFICE_SELECT,
  });

  if (!office) {
    return NextResponse.json({ error: "Escritório não encontrado." }, { status: 404 });
  }

  // Access Control
  if (role !== Role.MASTER && role !== Role.GERENTE_SENIOR) {
    if (role === Role.GERENTE_NEGOCIOS) {
      // Check if GN manages this office
      const isManager = office.businessManagerId === userId;
      // Also check managedOffices table
      const isLinked = await prisma.managerOffice.findUnique({
        where: {
          managerId_officeRecordId: { managerId: userId, officeRecordId: officeId },
        },
      });
      if (!isManager && !isLinked) {
        return NextResponse.json({ message: "Forbidden" }, { status: 403 });
      }
    } else if (role === Role.PROPRIETARIO) {
      if (office.ownerId !== userId) {
        // Also check ownedOffices if needed, but ownerId is direct
        const isOwner = await prisma.user.findFirst({
          where: {
            id: userId,
            ownedOffices: { some: { id: officeId } }
          }
        });
        if (!isOwner && office.ownerId !== userId) {
          return NextResponse.json({ message: "Forbidden" }, { status: 403 });
        }
      }
    } else {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }
  }

  const counts = await getOfficeUserCounts(params.id);
  return NextResponse.json(buildOfficeResponse(office, counts));
}

export async function PATCH(req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { role, id: userId } = session.user;
  const officeId = params.id;

  // Permissions: Master, GS, GN (managed only)
  if (role !== Role.MASTER && role !== Role.GERENTE_SENIOR && role !== Role.GERENTE_NEGOCIOS) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  if (role === Role.GERENTE_NEGOCIOS) {
    // Check if GN manages this office
    const isLinked = await prisma.managerOffice.findUnique({
      where: { managerId_officeRecordId: { managerId: userId, officeRecordId: officeId } },
    });
    // Check direct link too
    const officeCheck = await prisma.officeRecord.findUnique({ where: { id: officeId }, select: { businessManagerId: true } });

    if (!isLinked && officeCheck?.businessManagerId !== userId) {
      return NextResponse.json({ message: "Você não gerencia este escritório." }, { status: 403 });
    }
  }

  const body = await req.json().catch(() => ({}));

  const existing = await prisma.officeRecord.findUnique({
    where: { id: params.id },
    select: OFFICE_SELECT,
  });

  if (!existing) {
    return NextResponse.json({ error: "Escritório não encontrado." }, { status: 404 });
  }

  const data: Record<string, unknown> = {};

  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "Nome do escritório é obrigatório." }, { status: 400 });
    }
    data.name = name;
  }

  if (body.code !== undefined) {
    const rawCode = typeof body.code === "string" ? body.code.trim() : "";
    const targetCode = slugifyOfficeCode(rawCode || (typeof body.name === "string" ? body.name : existing.name));
    if (!targetCode) {
      return NextResponse.json({ error: "Código do escritório é obrigatório." }, { status: 400 });
    }
    if (targetCode !== existing.code) {
      const collision = await prisma.officeRecord.findFirst({
        where: { code: targetCode, NOT: { id: existing.id } },
      });
      if (collision) {
        return NextResponse.json({ error: "Código já está em uso." }, { status: 409 });
      }
    }
    data.code = targetCode;
  }

  if (body.region !== undefined) {
    data.region = normalizeOptionalString(body.region);
  }
  if (body.uf !== undefined) {
    data.uf = normalizeOptionalString(body.uf)?.toUpperCase() ?? null;
  }
  if (body.city !== undefined) {
    data.city = normalizeOptionalString(body.city);
  }
  if (body.notes !== undefined) {
    data.notes = normalizeOptionalString(body.notes);
  }
  if (body.active !== undefined) {
    if (typeof body.active !== "boolean") {
      return NextResponse.json({ error: "Valor de ativo inválido." }, { status: 400 });
    }
    data.active = body.active;
  }

  // Hierarchy updates
  // Only Master and GS can change hierarchy freely.
  // GN can update ownerId maybe? 
  // Requirement: "GN cria acesso para seus escritorios, edita hierarquia edita escritorio... cria proprietario"
  // So GN should be able to set ownerId.
  // Master/GS can set seniorManagerId, businessManagerId.

  if (role === Role.MASTER || role === Role.GERENTE_SENIOR) {
    if (body.seniorManagerId !== undefined) {
      const id = normalizeOptionalString(body.seniorManagerId);
      data.seniorManager = id ? { connect: { id } } : { disconnect: true };
    }
    if (body.businessManagerId !== undefined) {
      const id = normalizeOptionalString(body.businessManagerId);
      data.businessManager = id ? { connect: { id } } : { disconnect: true };
    }
  }

  // Everyone (allowed) can update owner
  if (body.ownerId !== undefined) {
    const id = normalizeOptionalString(body.ownerId);
    data.owner = id ? { connect: { id } } : { disconnect: true };
  }

  if (Object.keys(data).length === 0) {
    // No changes
    return NextResponse.json(buildOfficeResponse(existing, await getOfficeUserCounts(params.id)));
  }

  const updated = await prisma.officeRecord.update({
    where: { id: params.id },
    data,
    select: OFFICE_SELECT,
  });

  const counts = await getOfficeUserCounts(params.id);
  return NextResponse.json(buildOfficeResponse(updated, counts));
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { role } = session.user;

  // Allow Master and GS to delete
  if (role !== Role.MASTER && role !== Role.GERENTE_SENIOR) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const office = await prisma.officeRecord.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!office) {
    return NextResponse.json({ error: "Escritório não encontrado." }, { status: 404 });
  }

  const usage = await prisma.user.count({ where: { officeRecordId: params.id } });
  if (usage > 0) {
    return NextResponse.json(
      { error: "Não é possível excluir escritório com usuários vinculados." },
      { status: 400 }
    );
  }

  await prisma.officeRecord.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
