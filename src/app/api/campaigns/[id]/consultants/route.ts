export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserWithOffices, canDistributeLeads } from "@/lib/permissions";
import { Role } from "@prisma/client";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUserWithOffices();
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (user.role === Role.CONSULTOR) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const officeId = searchParams.get("officeId") ?? undefined;

  const canDistribute = await canDistributeLeads(user, params.id, officeId ?? undefined);
  if (!canDistribute) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const whereBase = {
    role: Role.CONSULTOR,
    ...(officeId ? { officeRecordId: officeId } : {}),
  };

  // Escopo por role
  if (user.role === Role.GERENTE_NEGOCIOS) {
    const managed = user.managedOfficeIds.length ? user.managedOfficeIds : ["__none__"];
    Object.assign(whereBase, { officeRecordId: { in: managed } });
  } else if (user.role === Role.PROPRIETARIO && user.officeRecordId) {
    Object.assign(whereBase, { officeRecordId: user.officeRecordId });
  }

  const consultants = await prisma.user.findMany({
    where: whereBase,
    select: {
      id: true,
      name: true,
      email: true,
      officeRecord: { select: { id: true, name: true } },
      officeRecordId: true,
    },
    orderBy: { name: "asc" },
  });

  const payload = consultants.map((c) => ({
    id: c.id,
    name: c.name ?? c.email ?? "",
    email: c.email ?? "",
    officeId: c.officeRecordId ?? null,
    officeName: c.officeRecord?.name ?? "",
  }));

  return NextResponse.json(payload);
}
