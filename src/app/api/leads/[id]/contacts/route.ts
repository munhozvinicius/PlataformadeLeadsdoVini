import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function POST(
    request: Request,
    { params }: { params: { id: string } }
) {
    const session = await getServerSession(authOptions);
    if (!session) return new NextResponse("Unauthorized", { status: 401 });

    try {
        const { contacts } = await request.json();

        // Get current lead to merge externalData
        const lead = await prisma.lead.findUnique({
            where: { id: params.id },
            select: { externalData: true }
        });

        if (!lead) return new NextResponse("Lead not found", { status: 404 });

        const currentExternal = (lead.externalData as Record<string, any>) || {};

        const updated = await prisma.lead.update({
            where: { id: params.id },
            data: {
                externalData: {
                    ...currentExternal,
                    validContacts: contacts
                }
            }
        });

        return NextResponse.json(updated);
    } catch (error) {
        console.error("Error updating contacts:", error);
        return new NextResponse("Internal Error", { status: 500 });
    }
}
