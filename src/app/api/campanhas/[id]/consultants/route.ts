import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

export async function GET(req: Request, { params }: { params: { id: string } }) {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role === Role.CONSULTOR) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const campaignId = params.id;

    try {
        // Get all leads in the campaign
        const leads = await prisma.lead.findMany({
            where: { campanhaId: campaignId },
            select: {
                id: true,
                consultorId: true,
                status: true,
                isWorked: true,
                interactionCount: true,
                updatedAt: true,
                consultor: {
                    select: { id: true, name: true, email: true }
                }
            }
        });

        const consultantsMap = new Map<string, any>();

        // Initialize with all potential consultants? 
        // Or just those with leads? 
        // Better to fetch all eligible consultants for the office/campaign first if we want to show zeros.
        // For now, let's just show those with leads + we'll need a way to add new ones in UI.

        leads.forEach(lead => {
            if (!lead.consultorId || !lead.consultor) return;

            const cId = lead.consultorId;
            if (!consultantsMap.has(cId)) {
                consultantsMap.set(cId, {
                    id: cId,
                    name: lead.consultor.name,
                    email: lead.consultor.email,
                    totalLeads: 0,
                    workedLeads: 0,
                    contactedLeads: 0,
                    closedLeads: 0,
                    lastActivity: null as Date | null,
                });
            }

            const stats = consultantsMap.get(cId);
            stats.totalLeads++;
            if (lead.isWorked || lead.interactionCount > 0) stats.workedLeads++;
            if (['EM_NEGOCIACAO', 'FECHADO', 'EM_CONTATO'].includes(lead.status)) stats.contactedLeads++;
            if (lead.status === 'FECHADO') stats.closedLeads++;

            if (lead.updatedAt) {
                const d = new Date(lead.updatedAt);
                if (!stats.lastActivity || d > stats.lastActivity) {
                    stats.lastActivity = d;
                }
            }
        });

        return NextResponse.json(Array.from(consultantsMap.values()));

    } catch (error) {
        console.error("Error fetching campaign consultants:", error);
        return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
    }
}
