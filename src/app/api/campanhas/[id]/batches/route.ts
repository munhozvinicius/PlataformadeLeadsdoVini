import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

export async function GET(req: Request, { params }: { params: { id: string } }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user || session.user.role === Role.CONSULTOR) {
            return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        }

        const batches = await prisma.importBatch.findMany({
            where: { campaignId: params.id },
            orderBy: { createdAt: "desc" },
            include: {
                criadoPor: { select: { name: true } }
            }
        });

        return NextResponse.json(batches);
    } catch (error) {
        console.error("Error fetching batches:", error);
        return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
    }
}
