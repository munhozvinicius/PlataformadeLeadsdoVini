import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isOfficeAdmin } from "@/lib/authRoles";
import { Role } from "@prisma/client";

const productSchema = z.object({
  productId: z.string().min(1),
  tower: z.string().min(1),
  category: z.string().min(1),
  name: z.string().min(1),
  quantity: z.number().int().min(1),
  monthlyValue: z.number().nonnegative().optional(),
  note: z.string().optional(),
});

const payloadSchema = z.object({
  products: z.array(productSchema).default([]),
});

type Params = { params: { id: string } };

async function assertPermission(leadId: string, userId: string, role: Role) {
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { consultorId: true, ownerId: true, officeId: true } });
  if (!lead) return { error: NextResponse.json({ message: "Lead não encontrado" }, { status: 404 }) };

  if (role === Role.CONSULTOR && lead.consultorId !== userId) {
    return { error: NextResponse.json({ message: "Unauthorized" }, { status: 401 }) };
  }
  if (role === Role.PROPRIETARIO && lead.ownerId !== userId) {
    return { error: NextResponse.json({ message: "Unauthorized" }, { status: 401 }) };
  }

  if (isOfficeAdmin(role) && role !== Role.MASTER) {
    const sessionUser = await prisma.user.findUnique({ where: { id: userId }, select: { officeRecordId: true } });
    if (!sessionUser?.officeRecordId || (lead.officeId && lead.officeId !== sessionUser.officeRecordId)) {
      return { error: NextResponse.json({ message: "Unauthorized" }, { status: 401 }) };
    }
  }

  return { lead };
}

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const permission = await assertPermission(params.id, session.user.id, session.user.role as Role);
  if (permission.error) return permission.error;

  const lead = await prisma.lead.findUnique({
    where: { id: params.id },
    select: { productCart: true },
  });

  return NextResponse.json((lead?.productCart as unknown[]) ?? []);
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload inválido", issues: parsed.error.flatten() }, { status: 422 });
  }

  const permission = await assertPermission(params.id, session.user.id, session.user.role as Role);
  if (permission.error) return permission.error;

  const now = new Date().toISOString();
  const normalized = parsed.data.products.map((p) => ({
    ...p,
    updatedAt: now,
  }));

  await prisma.lead.update({
    where: { id: params.id },
    data: { productCart: normalized },
  });

  return NextResponse.json(normalized);
}

