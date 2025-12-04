export const dynamic = "force-dynamic";

import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role, Profile, Prisma } from "@prisma/client";
import { canManageUsers, isProprietario } from "@/lib/authRoles";

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

  const sessionRole = session.user.role;
  if (!canManageUsers(sessionRole)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const sessionUser = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!sessionUser) {
    return NextResponse.json({ message: "Sessão inválida" }, { status: 401 });
  }

  if (isProprietario(sessionRole)) {
    const canEditSelf = targetUser.id === session.user.id;
    const canEditChild = targetUser.ownerId === session.user.id;
    if (!canEditSelf && !canEditChild) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
  }

  const body = await req.json();
  const { name, email, role, officeId, ownerId, active, password } = body;
  const updates: Prisma.UserUpdateInput = {};
  const finalRole = (role ?? targetUser.role) as Role;

  if (name) updates.name = name;
  if (email) updates.email = email;

  if (role) {
    if (isProprietario(sessionRole) && role !== Role.CONSULTOR) {
      return NextResponse.json({ message: "Proprietário só pode manter consultores" }, { status: 401 });
    }
    updates.role = role;
    updates.profile = role as Profile;
  }

  const requiresOffice = ([Role.PROPRIETARIO, Role.CONSULTOR, Role.GERENTE_NEGOCIOS] as Role[]).includes(
    finalRole
  );
  if (officeId && !isProprietario(sessionRole)) {
    const officeRecord = await prisma.officeRecord.findUnique({ where: { id: officeId } });
    if (!officeRecord) {
      return NextResponse.json({ message: "Escritório inválido" }, { status: 400 });
    }
    updates.office = officeRecord.office;
    updates.officeRecord = { connect: { id: officeRecord.id } };
  } else if (isProprietario(sessionRole)) {
    if (sessionUser.officeId) {
      updates.office = sessionUser.office;
      updates.officeRecord = { connect: { id: sessionUser.officeId } };
    }
  } else if (requiresOffice && !targetUser.officeId) {
    const fallbackOffice = await prisma.officeRecord.findUnique({ where: { office: targetUser.office } });
    if (fallbackOffice) {
      updates.officeRecord = { connect: { id: fallbackOffice.id } };
    }
  }

  const requiresOwner = ([Role.CONSULTOR] as Role[]).includes(finalRole);
  const currentOfficeForOwner = updates.office ?? targetUser.office;

  if (requiresOwner) {
    if (isProprietario(sessionRole)) {
      updates.owner = { connect: { id: session.user.id } };
    } else if (ownerId) {
      const owner = await prisma.user.findUnique({ where: { id: ownerId } });
      if (!owner || owner.role !== Role.PROPRIETARIO) {
        return NextResponse.json({ message: "Proprietário inválido" }, { status: 400 });
      }
      if (owner.office !== currentOfficeForOwner) {
        return NextResponse.json(
          { message: "Proprietário deve pertencer ao mesmo escritório" },
          { status: 400 }
        );
      }
      updates.owner = { connect: { id: owner.id } };
    }
  } else {
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
