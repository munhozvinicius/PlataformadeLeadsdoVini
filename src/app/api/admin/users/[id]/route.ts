export const dynamic = "force-dynamic";

import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Office, Role, Profile, Prisma } from "@prisma/client";
import { canManageUserRole, canManageUsers } from "@/lib/authRoles";
import { assignUserOffices, normalizeOfficeCodes, hasOfficeOverlap, getManagedOfficeIds, assignManagedOffices } from "@/lib/userOffice";

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  profile: true,
  office: true,
  owner: { select: { id: true, name: true, email: true } },
  senior: { select: { id: true, name: true } },
  offices: { select: { office: true } },
  active: true,
};

function extractOfficeCodes(offices: { office: Office }[]): Office[] {
  return offices.map((entry) => entry.office);
}

function extractOwnerOffices(owner?: { offices?: { office: Office }[] }): Office[] {
  if (!owner || !owner.offices) return [];
  return owner.offices.map((entry) => entry.office);
}

function canAccessTarget(
  sessionRole: Role,
  sessionUserId: string,
  sessionOffices: Office[],
  managedOfficeIds: string[],
  targetUser: {
    id: string;
    role: Role;
    ownerId?: string | null;
    officeRecordId?: string | null;
    offices: { office: Office }[];
    owner?: { offices?: { office: Office }[]; officeRecordId?: string | null } | null;
  }
): boolean {
  const targetOffices = extractOfficeCodes(targetUser.offices);
  const inManagedOffice =
    (targetUser.officeRecordId && managedOfficeIds.includes(targetUser.officeRecordId)) ||
    (targetUser.owner?.officeRecordId && managedOfficeIds.includes(targetUser.owner.officeRecordId));

  if (sessionRole === Role.MASTER) return true;
  if (sessionRole === Role.GERENTE_SENIOR) {
    return targetUser.role !== Role.MASTER;
  }
  if (sessionRole === Role.GERENTE_NEGOCIOS) {
    if (targetUser.id === sessionUserId) return true;
    const allowedRoles: Role[] = [Role.PROPRIETARIO, Role.CONSULTOR];
    if (!allowedRoles.includes(targetUser.role)) return false;
    if (inManagedOffice) return true;
    const ownerOffices = extractOwnerOffices(targetUser.owner ?? undefined);
    return hasOfficeOverlap(sessionOffices, targetOffices) || hasOfficeOverlap(sessionOffices, ownerOffices);
  }
  if (sessionRole === Role.PROPRIETARIO) {
    if (targetUser.id === sessionUserId) return true;
    return targetUser.ownerId === sessionUserId && targetUser.role === Role.CONSULTOR;
  }
  if (sessionRole === Role.CONSULTOR) {
    return targetUser.id === sessionUserId;
  }
  return false;
}

export async function GET(req: Request, { params }: { params: { id?: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const sessionRole = session.user.role;
  if (!sessionRole) {
    return NextResponse.json({ message: "Sessão inválida" }, { status: 401 });
  }

  const targetId = params.id;
  if (!targetId) {
    return NextResponse.json({ message: "User id is required" }, { status: 400 });
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: targetId },
    include: {
      owner: { include: { offices: { select: { office: true } }, officeRecord: { select: { id: true } } } },
      officeRecord: { select: { id: true } },
      offices: { select: { office: true } },
    },
  });
  if (!targetUser) {
    return NextResponse.json({ message: "Usuário não encontrado" }, { status: 404 });
  }

  if (sessionRole === Role.CONSULTOR && targetUser.id !== session.user.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  }

  const sessionUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { offices: { select: { office: true } } },
  });
  if (!sessionUser) {
    return NextResponse.json({ message: "Sessão inválida" }, { status: 401 });
  }

  const managedOfficeIds = sessionRole === Role.GERENTE_NEGOCIOS ? await getManagedOfficeIds(session.user.id) : [];

  if (
    !canAccessTarget(
      sessionRole,
      sessionUser.id,
      extractOfficeCodes(sessionUser.offices),
      managedOfficeIds,
      {
        id: targetUser.id,
        role: targetUser.role,
        ownerId: targetUser.ownerId,
        officeRecordId: targetUser.officeRecord?.id ?? null,
        offices: targetUser.offices,
        owner: targetUser.owner
          ? { offices: targetUser.owner.offices, officeRecordId: targetUser.owner.officeRecord?.id ?? null }
          : undefined,
      }
    )
  ) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  }

  return NextResponse.json(targetUser);
}

export async function PATCH(req: Request, { params }: { params: { id?: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const sessionRole = session.user.role;
  if (!sessionRole) {
    return NextResponse.json({ message: "Sessão inválida" }, { status: 401 });
  }

  const targetId = params.id;
  if (!targetId) {
    return NextResponse.json({ message: "User id is required" }, { status: 400 });
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: targetId },
    include: {
      owner: { include: { offices: { select: { office: true } }, officeRecord: { select: { id: true } } } },
      officeRecord: { select: { id: true } },
      offices: { select: { office: true } },
    },
  });
  if (!targetUser) {
    return NextResponse.json({ message: "Usuário não encontrado" }, { status: 404 });
  }

  const sessionUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { offices: { select: { office: true } } },
  });
  if (!sessionUser) {
    return NextResponse.json({ message: "Sessão inválida" }, { status: 401 });
  }

  const managedOfficeIds = sessionRole === Role.GERENTE_NEGOCIOS ? await getManagedOfficeIds(session.user.id) : [];

  if (!canManageUsers(sessionRole)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (
    !canAccessTarget(
      sessionRole,
      sessionUser.id,
      extractOfficeCodes(sessionUser.offices),
      managedOfficeIds,
      {
        id: targetUser.id,
        role: targetUser.role,
        ownerId: targetUser.ownerId,
        officeRecordId: targetUser.officeRecord?.id ?? null,
        offices: targetUser.offices,
        owner: targetUser.owner
          ? { offices: targetUser.owner.offices, officeRecordId: targetUser.owner.officeRecord?.id ?? null }
          : undefined,
      }
    )
  ) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  }

  if (sessionRole === Role.CONSULTOR && targetUser.id !== session.user.id) {
    return NextResponse.json({ message: "Consultores não podem editar outros usuários" }, { status: 403 });
  }

  const body = await req.json();
  const { name, email, role, officeIds, ownerId, active, password, officeRecordId } = body;

  const updates: Prisma.UserUpdateInput = {};
  const finalRole = (role ?? targetUser.role) as Role;
  const targetOfficeRecordId = officeRecordId ?? targetUser.officeRecordId ?? null;
  const isSelf = targetUser.id === session.user.id;

  if (!canManageUserRole(sessionRole, targetUser.role, isSelf)) {
    return NextResponse.json({ message: "Sem permissão para este usuário" }, { status: 403 });
  }
  if (role && !canManageUserRole(sessionRole, role, isSelf)) {
    return NextResponse.json({ message: "Sem permissão para alterar para este perfil" }, { status: 403 });
  }

  if (name) updates.name = name;
  if (email) updates.email = email;
  if (role) {
    if (!Object.values(Role).includes(role)) {
      return NextResponse.json({ message: "Perfil inválido" }, { status: 400 });
    }
    updates.role = role;
    updates.profile = role as Profile;
  }

  const normalizedOfficeIds = normalizeOfficeCodes(officeIds);
  let officesToAssign: Office[] | null = null;

  if (finalRole === Role.GERENTE_NEGOCIOS && normalizedOfficeIds.length) {
    officesToAssign = normalizedOfficeIds;
    updates.office = normalizedOfficeIds[0];
  }

  if (finalRole === Role.PROPRIETARIO && normalizedOfficeIds.length) {
    officesToAssign = [normalizedOfficeIds[0]];
    updates.office = normalizedOfficeIds[0];
  }

  let ownerConnect: Prisma.UserUpdateInput["owner"] | undefined;
  if (finalRole === Role.CONSULTOR) {
    const currentOwnerId = targetUser.ownerId;
    const newOwnerId = ownerId ?? currentOwnerId;
    if (!newOwnerId) {
      return NextResponse.json({ message: "Consultor precisa de proprietário" }, { status: 400 });
    }
    const owner = await prisma.user.findUnique({
      where: { id: newOwnerId },
      include: { offices: { select: { office: true } } },
    });
    if (!owner || owner.role !== Role.PROPRIETARIO) {
      return NextResponse.json({ message: "Proprietário inválido" }, { status: 400 });
    }
    if (sessionRole === Role.GERENTE_NEGOCIOS) {
      if (!targetOfficeRecordId || !managedOfficeIds.includes(targetOfficeRecordId)) {
        return NextResponse.json({ message: "GN só pode gerenciar consultor de seus escritórios" }, { status: 403 });
      }
      if (owner.officeRecordId && !managedOfficeIds.includes(owner.officeRecordId)) {
        return NextResponse.json({ message: "GN só pode associar consultor a proprietário do seu escritório" }, { status: 403 });
      }
    }
    if (!targetOfficeRecordId) {
      return NextResponse.json({ message: "Consultor precisa de um escritório" }, { status: 400 });
    }
    ownerConnect = { connect: { id: owner.id } };
    const ownerOffices = extractOfficeCodes(owner.offices);
    officesToAssign = ownerOffices;
    updates.office = ownerOffices[0] ?? targetUser.office;
  } else {
    updates.owner = { disconnect: true };
  }

  if (typeof active === "boolean") {
    updates.active = active;
  }

  if (password) {
    updates.password = await bcrypt.hash(password, 10);
  }

  if (Object.keys(updates).length === 0 && officeRecordId === undefined) {
    return NextResponse.json({ message: "Nenhuma alteração fornecida" }, { status: 400 });
  }

  try {
    const updated = await prisma.user.update({
      where: { id: targetId },
      data: {
        ...updates,
        ...(ownerConnect ? { owner: ownerConnect } : {}),
        ...(officeRecordId !== undefined
          ? officeRecordId
            ? { officeRecord: { connect: { id: officeRecordId } } }
            : { officeRecord: { disconnect: true } }
          : finalRole !== Role.CONSULTOR
            ? {}
            : targetOfficeRecordId
              ? { officeRecord: { connect: { id: targetOfficeRecordId } } }
              : {}),
      },
      select: USER_SELECT,
    });

    if (officesToAssign) {
      await assignUserOffices(targetId, officesToAssign);
    }

    return NextResponse.json(updated);
  } catch (error: unknown) {
    console.error("Error in /api/admin/users/[id] PATCH:", error);
    const code = (error as { code?: string })?.code;
    if (code === "P2002") {
      return NextResponse.json({ message: "Email já cadastrado" }, { status: 409 });
    }
    return NextResponse.json({ message: "Não foi possível atualizar o usuário" }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id?: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const sessionRole = session.user.role;
  if (!sessionRole) {
    return NextResponse.json({ message: "Sessão inválida" }, { status: 401 });
  }

  if (!canManageUsers(sessionRole)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const targetId = params.id;
  if (!targetId) {
    return NextResponse.json({ message: "User id is required" }, { status: 400 });
  }

  if (targetId === session.user.id) {
    return NextResponse.json({ message: "Você não pode se excluir" }, { status: 400 });
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: targetId },
    include: {
      owner: { include: { offices: { select: { office: true } }, officeRecord: { select: { id: true } } } },
      officeRecord: { select: { id: true } },
      offices: { select: { office: true } },
    },
  });
  if (!targetUser) {
    return NextResponse.json({ message: "Usuário não encontrado" }, { status: 404 });
  }

  const sessionUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { offices: { select: { office: true } } },
  });
  if (!sessionUser) {
    return NextResponse.json({ message: "Sessão inválida" }, { status: 401 });
  }

  const managedOfficeIds = sessionRole === Role.GERENTE_NEGOCIOS ? await getManagedOfficeIds(session.user.id) : [];

  if (
    !canAccessTarget(
      sessionRole,
      sessionUser.id,
      extractOfficeCodes(sessionUser.offices),
      managedOfficeIds,
      {
        id: targetUser.id,
        role: targetUser.role,
        ownerId: targetUser.ownerId,
        officeRecordId: targetUser.officeRecord?.id ?? null,
        offices: targetUser.offices,
        owner: targetUser.owner
          ? { offices: targetUser.owner.offices, officeRecordId: targetUser.owner.officeRecord?.id ?? null }
          : undefined,
      }
    )
  ) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  }

  // Hierarchical checks
  if (targetUser.role === Role.MASTER && sessionRole !== Role.MASTER) {
    return NextResponse.json({ message: "Apenas Master pode excluir Master" }, { status: 403 });
  }
  if (targetUser.role === Role.GERENTE_SENIOR && sessionRole !== Role.MASTER && sessionRole !== Role.GERENTE_SENIOR) {
    return NextResponse.json({ message: "Você não pode excluir um Gerente Sênior" }, { status: 403 });
  }
  // GN can only delete within office scope (handled by canAccessTarget) and lower roles?
  // canAccessTarget handles office overlap. But we should ensure GN doesn't delete another GN unless valid?
  // Logic: canAccessTarget returns true if office overlaps.
  // We want GN to assume full control over their office, including deleting users.
  // But usually create/delete logic implies stricter hierarchy.
  // Safe default: cannot delete someone with Same or Higher role?
  // Master > GS > GN > Owner > Consultant.
  const hierarchy = {
    [Role.MASTER]: 4,
    [Role.GERENTE_SENIOR]: 3,
    [Role.GERENTE_NEGOCIOS]: 2,
    [Role.PROPRIETARIO]: 1,
    [Role.CONSULTOR]: 0
  };

  if (hierarchy[sessionRole] < hierarchy[targetUser.role]) {
    return NextResponse.json({ message: "Você não pode excluir um usuário com cargo superior" }, { status: 403 });
  }
  // Prevent deleting same rank (except Master/GS who are global admins?)
  // Actually, usually you can't delete your peer.
  if (sessionRole !== Role.MASTER && hierarchy[sessionRole] === hierarchy[targetUser.role]) {
    return NextResponse.json({ message: "Você não pode excluir um usuário do mesmo nível" }, { status: 403 });
  }

  try {
    await prisma.user.delete({
      where: { id: targetId },
    });
    return NextResponse.json({ message: "Usuário excluído com sucesso" });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "Erro ao excluir usuário" }, { status: 500 });
  }
}
