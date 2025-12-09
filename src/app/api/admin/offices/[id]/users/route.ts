export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Role } from "@prisma/client";

type Params = { params: { id: string } };

export async function GET(_req: Request, { params }: Params) {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const { role, id: userId } = session.user;
    const officeId = params.id;

    if (!officeId) {
        return NextResponse.json({ error: "Escritório inválido." }, { status: 400 });
    }

    // RBAC
    if (role === Role.MASTER || role === Role.GERENTE_SENIOR) {
        // Allowed
    } else if (role === Role.GERENTE_NEGOCIOS) {
        // Check if user manages this office
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: { managedOffices: true }
        });

        // Check via ManagerOffice relation OR the legacy businessManagerId field on the OfficeRecord
        const office = await prisma.officeRecord.findUnique({
            where: { id: officeId },
            select: { businessManagerId: true }
        });

        const managesViaTable = user?.managedOffices.some(mo => mo.officeRecordId === officeId);
        const managesViaField = office?.businessManagerId === userId;

        if (!managesViaTable && !managesViaField) {
            return NextResponse.json({ message: "Forbidden" }, { status: 403 });
        }
    } else {
        // Proprietario/Consultor cannot see this list in this context
        return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const [proprietarios, consultores] = await Promise.all([
        prisma.user.findMany({
            where: { officeRecordId: officeId, role: Role.PROPRIETARIO },
            select: { id: true, name: true, email: true },
            orderBy: { name: "asc" },
        }),
        prisma.user.findMany({
            where: { officeRecordId: officeId, role: Role.CONSULTOR },
            select: {
                id: true,
                name: true,
                email: true,
                owner: { select: { id: true, name: true, email: true } },
            },
            orderBy: { name: "asc" },
        }),
    ]);

    return NextResponse.json({ proprietarios, consultores });
}
