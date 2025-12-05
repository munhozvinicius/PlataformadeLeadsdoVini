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
  const auth = await requireMaster();
  if ("response" in auth) return auth.response;

  const office = await prisma.officeRecord.findUnique({
    where: { id: params.id },
    select: OFFICE_SELECT,
  });

  if (!office) {
    return NextResponse.json({ error: "Escritório não encontrado." }, { status: 404 });
  }

  const counts = await getOfficeUserCounts(params.id);
  return NextResponse.json(buildOfficeResponse(office, counts));
}

export async function PATCH(req: Request, { params }: Params) {
  const auth = await requireMaster();
  if ("response" in auth) return auth.response;

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

  if (body.seniorManagerId !== undefined) {
    const id = normalizeOptionalString(body.seniorManagerId);
    data.seniorManager = id ? { connect: { id } } : { disconnect: true };
  }
  if (body.businessManagerId !== undefined) {
    const id = normalizeOptionalString(body.businessManagerId);
    data.businessManager = id ? { connect: { id } } : { disconnect: true };
  }
  if (body.ownerId !== undefined) {
    const id = normalizeOptionalString(body.ownerId);
    data.owner = id ? { connect: { id } } : { disconnect: true };
  }

  if (Object.keys(data).length === 0) {
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
  const auth = await requireMaster();
  if ("response" in auth) return auth.response;

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
