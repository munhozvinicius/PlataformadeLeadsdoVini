
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
    const session = await getServerSession(authOptions);
    const allowedRoles: string[] = [Role.MASTER, Role.GERENTE_SENIOR, Role.GERENTE_NEGOCIOS];

    if (!session?.user || !allowedRoles.includes(session.user.role)) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    try {
        await prisma.announcement.delete({
            where: { id: params.id }
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error deleting announcement:", error);
        return NextResponse.json({ message: "Error" }, { status: 500 });
    }
}
