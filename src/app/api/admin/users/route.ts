export const dynamic = "force-dynamic";

import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Office, Role, Profile, Prisma } from "@prisma/client";
import { canManageUsers, canManageUserRole, isProprietario } from "@/lib/authRoles";
import { assignUserOffices, buildUsersFilter, getUserOfficeCodes, normalizeOfficeCodes, getManagedOfficeIds } from "@/lib/userOffice";

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  profile: true,
  office: true,
  officeRecord: { select: { id: true, name: true, code: true } },
  owner: { select: { id: true, name: true, email: true } },
  senior: { select: { id: true, name: true, email: true } },
  offices: { select: { office: true } },
  active: true,
};

const CREATOR_ROLES = [
  Role.MASTER,
  Role.GERENTE_SENIOR,
  Role.GERENTE_NEGOCIOS,
  Role.PROPRIETARIO,
];

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const currentRole = session.user.role;
  if (!currentRole) {
    return NextResponse.json({ message: "Sessão inválida" }, { status: 401 });
  }
  if (!canManageUsers(currentRole)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const sessionUser = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!sessionUser) {
    return NextResponse.json({ message: "Sessão inválida" }, { status: 401 });
  }

  if (currentRole === Role.CONSULTOR) {
    return NextResponse.json({ message: "Acesso proibido" }, { status: 403 });
  }

  const where = await buildUsersFilter(currentRole, session.user.id);

  const users = await prisma.user.findMany({
    where,
    include: {
      owner: {
        include: {
          officeRecord: { select: { id: true, name: true, code: true } },
          senior: { select: { id: true, name: true, email: true } },
          offices: { select: { office: true } },
        },
      },
      senior: { select: { id: true, name: true, email: true } },
      officeRecord: { select: { id: true, name: true, code: true } },
      offices: { select: { office: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  const officeManagers = new Map<Office, { gs?: typeof users[number]; gn?: typeof users[number] }>();
  users.forEach((user) => {
    user.offices.forEach((entry) => {
      const current = officeManagers.get(entry.office) ?? {};
      if (user.role === Role.GERENTE_SENIOR) {
        current.gs = user;
      }
      if (user.role === Role.GERENTE_NEGOCIOS) {
        current.gn = user;
      }
      officeManagers.set(entry.office, current);
    });
  });

  const enhanced = users.map((user) => {
    const firstOffice = user.offices[0]?.office;
    const officeEntry = firstOffice ? officeManagers.get(firstOffice) : undefined;
    const baseGS = user.senior ?? user.owner?.senior ?? officeEntry?.gs ?? null;
    const baseGN = officeEntry?.gn ?? null;
    const derivedGS =
      baseGS && (baseGS as { id: string; name?: string | null; email?: string | null })
        ? {
          id: baseGS.id,
          name: baseGS.name,
          email: baseGS.email,
        }
        : null;
    const derivedGN =
      baseGN && (baseGN as { id: string; name?: string | null; email?: string | null })
        ? {
          id: baseGN.id,
          name: baseGN.name,
          email: baseGN.email,
        }
        : null;

    return {
      ...user,
      derivedGS,
      derivedGN,
    };
  });

  return NextResponse.json(enhanced);
}

export async function POST(req: Request) {
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

  if (sessionRole === Role.CONSULTOR) {
    return NextResponse.json({ message: "Consultores não podem criar usuários" }, { status: 403 });
  }

  const body = await req.json();
  const { name, email, password, role, officeIds, ownerId, seniorId, active, officeRecordId, managedOfficeIds } = body;

  if (!name || !email || !password || !role) {
    return NextResponse.json({ message: "Dados insuficientes" }, { status: 400 });
  }

  if (!Object.values(Role).includes(role)) {
    return NextResponse.json({ message: "Perfil inválido" }, { status: 400 });
  }

  if (!CREATOR_ROLES.includes(sessionRole)) {
    return NextResponse.json({ message: "Você não pode criar esse tipo de usuário" }, { status: 403 });
  }

  const targetRole = role as Role;
  const gnManagedOffices = sessionRole === Role.GERENTE_NEGOCIOS ? await getManagedOfficeIds(session.user.id) : [];
  if (!canManageUserRole(sessionRole, targetRole, false)) {
    return NextResponse.json({ message: "Você não tem permissão para criar este perfil" }, { status: 403 });
  }

  if (isProprietario(sessionRole) && targetRole !== Role.CONSULTOR) {
    return NextResponse.json({ message: "Proprietário só pode criar consultores" }, { status: 403 });
  }

  const normalizedOffices = normalizeOfficeCodes(officeIds);
  const managedOfficeRecordIds = Array.isArray(managedOfficeIds)
    ? managedOfficeIds.filter((id: unknown): id is string => typeof id === "string" && id.trim().length > 0)
    : [];
  const targetOfficeRecordId = officeRecordId as string | undefined;
  let ownerConnect;
  if (role === Role.CONSULTOR) {
    const targetOwnerId = ownerId ?? (isProprietario(sessionRole) ? session.user.id : null);
    if (!targetOwnerId) {
      return NextResponse.json({ message: "Consultor precisa de proprietário" }, { status: 400 });
    }
    const owner = await prisma.user.findUnique({ where: { id: targetOwnerId } });
    if (!owner || owner.role !== Role.PROPRIETARIO) {
      return NextResponse.json({ message: "Proprietário inválido" }, { status: 400 });
    }
    if (sessionRole === Role.GERENTE_NEGOCIOS) {
      if (!targetOfficeRecordId || !gnManagedOffices.includes(targetOfficeRecordId)) {
        return NextResponse.json({ message: "GN só pode criar consultor em seus escritórios" }, { status: 403 });
      }
      if (owner.officeRecordId && !gnManagedOffices.includes(owner.officeRecordId)) {
        return NextResponse.json({ message: "GN só pode associar consultor a proprietário do seu escritório" }, { status: 403 });
      }
    }
    ownerConnect = { connect: { id: owner.id } };
    if (!targetOfficeRecordId) {
      return NextResponse.json({ message: "Consultor precisa de um escritório" }, { status: 400 });
    }
  }

  const seniorConnect =
    role === Role.GERENTE_NEGOCIOS
      ? sessionRole === Role.GERENTE_SENIOR
        ? { connect: { id: session.user.id } }
        : seniorId
          ? { connect: { id: seniorId } }
          : undefined
      : undefined;

  try {
    const hashed = await bcrypt.hash(password, 10);
    const targetOffices: Office[] = [];
    if (role === Role.GERENTE_SENIOR) {
      targetOffices.push(...(Object.values(Office) as Office[]));
    } else if (role === Role.GERENTE_NEGOCIOS) {
      // GN pode ser criado sem escritório; se vierem IDs válidos, conecta.
      const officeRecordIds =
        managedOfficeRecordIds.length > 0
          ? managedOfficeRecordIds
          : targetOfficeRecordId
            ? [targetOfficeRecordId]
            : [];

      // opcional: associa office enum legacy se existir mapeamento
      targetOffices.push(...normalizedOffices);

      let validOffices: { id: string }[] = [];
      if (officeRecordIds.length) {
        validOffices = await prisma.officeRecord.findMany({
          where: { id: { in: officeRecordIds } },
          select: { id: true },
        });
      }

      const managerUser = await prisma.user.create({
        data: {
          name,
          email,
          password: hashed,
          role,
          profile: role as Profile,
          office: targetOffices[0] ?? Office.SAFE_TI,
          ...(targetOfficeRecordId ? { officeRecord: { connect: { id: targetOfficeRecordId } } } : {}),
          ...(ownerConnect ? { owner: ownerConnect } : {}),
          ...(seniorConnect ? { senior: seniorConnect } : {}),
          active: typeof active === "boolean" ? active : true,
          ...(validOffices.length
            ? {
                managedOffices: {
                  create: validOffices.map((o) => ({ officeRecordId: o.id })),
                },
              }
            : {}),
        },
        select: USER_SELECT,
      });
      if (targetOffices.length) {
        await assignUserOffices(managerUser.id, targetOffices);
      }
      return NextResponse.json(managerUser, { status: 201 });
    } else if (role === Role.PROPRIETARIO) {
      if (!targetOfficeRecordId && !normalizedOffices.length) {
        return NextResponse.json({ message: "Proprietário precisa de um escritório vinculado" }, { status: 400 });
      }
      if (sessionRole === Role.GERENTE_NEGOCIOS) {
        if (!targetOfficeRecordId || !gnManagedOffices.includes(targetOfficeRecordId)) {
          return NextResponse.json({ message: "GN só pode criar proprietário em seus escritórios" }, { status: 403 });
        }
      }
      if (normalizedOffices.length) {
        targetOffices.push(normalizedOffices[0]);
      }
    } else if (role === Role.CONSULTOR) {
      if (!ownerConnect) {
        return NextResponse.json({ message: "Proprietário inválido" }, { status: 400 });
      }
      const ownerIdValue = (ownerConnect.connect as { id: string }).id;
      const ownerOffices = await getUserOfficeCodes(ownerIdValue);
      if (!ownerOffices.length) {
        return NextResponse.json({ message: "Proprietário sem escritório" }, { status: 400 });
      }
      targetOffices.push(...ownerOffices);
    }

    const userData: Prisma.UserCreateInput = {
      name,
      email,
      password: hashed,
      role,
      profile: role as Profile,
      office: targetOffices[0] ?? Office.SAFE_TI,
      ...(targetOfficeRecordId ? { officeRecord: { connect: { id: targetOfficeRecordId } } } : {}),
      ...(ownerConnect ? { owner: ownerConnect } : {}),
      ...(seniorConnect ? { senior: seniorConnect } : {}),
      active: typeof active === "boolean" ? active : true,
    };
    const user = await prisma.user.create({
      data: userData,
      select: USER_SELECT,
    });

    await assignUserOffices(user.id, targetOffices);

    return NextResponse.json(user, { status: 201 });
  } catch (error: unknown) {
    console.error("Error in /api/admin/users POST:", error);
    const code = (error as { code?: string })?.code;
    if (code === "P2002") {
      return NextResponse.json({ message: "Email já cadastrado" }, { status: 409 });
    }
    return NextResponse.json({ message: "Erro ao criar usuário" }, { status: 500 });
  }
}
