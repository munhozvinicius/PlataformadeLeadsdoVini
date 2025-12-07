import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth"; // Ajuste conforme seu setup de auth
import { getServerSession } from "next-auth/next";

export async function PUT(req: Request, { params }: { params: { id: string } }) {
    const session = await getServerSession(authOptions);
    if (!session) return new NextResponse("Unauthorized", { status: 401 });

    try {
        const { telefones } = await req.json();
        const leadId = params.id;

        // Atualiza o campo telefones (agora armazenando JSON com feedback)
        const updatedLead = await prisma.lead.update({
            where: { id: leadId },
            data: {
                telefones: telefones
            }
        });

        return NextResponse.json(updatedLead);
    } catch (error) {
        console.error("Error updating phones:", error);
        return new NextResponse("Internal Error", { status: 500 });
    }
}
