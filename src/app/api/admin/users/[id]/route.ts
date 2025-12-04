export const dynamic = "force-dynamic";

import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Office, Role, Profile, Prisma } from "@prisma/client";

export async function PATCH(req: Request, { params }: { params: { id?: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const targetId = params.id;
  if (!targetId) {
    return NextResponse.json({ message: "User id is required" }, { status: 400 });
  }

  const targetUser = await prisma.user.findUnique({ where: { id: targetId } });
  if (!targetUser) {
    return NextResponse.json({ message: "Usuário não encontrado" }, { status: 404 });
  }

  const sessionRole = session.user.role as Role;
  if (sessionRole === Role.PROPRIETARIO) {
    const canEditSelf = targetUser.id === session.user.id;
    const canEditConsultor = targetUser.ownerId === session.user.id;
    if (!canEditSelf && !canEditConsultor) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
  } else if (sessionRole !== Role.MASTER) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { name, email, role, officeId, ownerId, active, password } = body;

  if (role && sessionRole !== Role.MASTER) {
    return NextResponse.json({ message: "Somente MASTER pode mudar o perfil." }, { status: 401 });
  }

  const updates: Prisma.UserUpdateInput = {};
  const finalRole = (role ?? targetUser.role) as Role;

  if (name) updates.name = name;
  if (email) updates.email = email;

  if (role) {
    updates.role = role;
    updates.profile = (role as Profile) ?? role;
  }

  let officeRecordToConnect: { id: string; office: Office } | null = null;
  if (officeId) {
    const officeRecord = await prisma.officeRecord.findUnique({ where: { id: officeId } });
    if (!officeRecord) {
      return NextResponse.json({ message: "Escritório inválido" }, { status: 400 });
    }
    officeRecordToConnect = { id: officeRecord.id, office: officeRecord.office };
    updates.office = officeRecord.office;
    updates.officeRecord = { connect: { id: officeRecord.id } };
  }

  const targetOfficeForOwner = officeRecordToConnect?.office ?? targetUser.office;
  if (ownerId !== undefined) {
    if (finalRole !== Role.CONSULTOR) {
      updates.owner = { disconnect: true };
    } else if (ownerId === null) {
      updates.owner = { disconnect: true };
    } else {
      const owner = await prisma.user.findUnique({ where: { id: ownerId } });
      if (!owner || owner.role !== Role.PROPRIETARIO) {
        return NextResponse.json({ message: "Proprietário inválido" }, { status: 400 });
      }
      if (owner.office !== targetOfficeForOwner) {
        return NextResponse.json(
          { message: "Proprietário deve pertencer ao mesmo escritório" },
          { status: 400 }
        );
      }
      updates.owner = { connect: { id: owner.id } };
    }
  } else if (finalRole !== Role.CONSULTOR) {
    updates.owner = { disconnect: true };
  }

  if (typeof active === "boolean") {
    updates.active = active;
  }

  if (password) {
    updates.password = await bcrypt.hash(password, 10);
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ message: "Nenhuma alteração fornecida" }, { status: 400 });
  }

  try {
    const updated = await prisma.user.update({
      where: { id: targetId },
      data: updates,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        profile: true,
        office: true,
        officeRecord: { select: { id: true } },
        owner: { select: { id: true, name: true, email: true } },
        active: true,
      },
    });
    return NextResponse.json(updated);
  } catch (error: unknown) {
    const code = (error as { code?: string })?.code;
    if (code === "P2002") {
      return NextResponse.json({ message: "Email já cadastrado" }, { status: 409 });
    }
    return NextResponse.json({ message: "Não foi possível atualizar o usuário" }, { status: 500 });
  }
}
