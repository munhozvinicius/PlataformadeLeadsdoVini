import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isOfficeAdmin } from "@/lib/authRoles";
import { Role } from "@prisma/client";

const eventSchema = z.object({
  type: z.string().min(1),
  payload: z.any().optional(),
});

type Params = { params: { id: string } };

async function ensurePermission(leadId: string, userId: string, role: Role) {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { consultorId: true, ownerId: true, officeId: true },
  });
  if (!lead) return { error: NextResponse.json({ message: "Lead não encontrado" }, { status: 404 }) };

  if (role === Role.CONSULTOR && lead.consultorId !== userId) {
    return { error: NextResponse.json({ message: "Unauthorized" }, { status: 401 }) };
  }
  if (role === Role.PROPRIETARIO && lead.ownerId !== userId) {
    return { error: NextResponse.json({ message: "Unauthorized" }, { status: 401 }) };
  }
  if (isOfficeAdmin(role) && role !== Role.MASTER) {
    const sessionUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { officeRecordId: true },
    });
    if (!sessionUser?.officeRecordId || (lead.officeId && lead.officeId !== sessionUser.officeRecordId)) {
      return { error: NextResponse.json({ message: "Unauthorized" }, { status: 401 }) };
    }
  }
  return { lead };
}

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const permission = await ensurePermission(params.id, session.user.id, session.user.role as Role);
  if (permission.error) return permission.error;

  const events = await prisma.leadEvent.findMany({
    where: { leadId: params.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(events);
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const parsed = eventSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload inválido", issues: parsed.error.flatten() }, { status: 422 });
  }

  const permission = await ensurePermission(params.id, session.user.id, session.user.role as Role);
  if (permission.error) return permission.error;

  const event = await prisma.leadEvent.create({
    data: {
      leadId: params.id,
      userId: session.user.id,
      type: parsed.data.type,
      payload: parsed.data.payload ?? {},
    },
  });

  return NextResponse.json(event, { status: 201 });
}

