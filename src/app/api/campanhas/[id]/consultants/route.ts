import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

interface ConsultantStat {
    id: string;
    name: string;
    email: string;
    totalLeads: number;
    workedLeads: number;
    contactedLeads: number;
    closedLeads: number;
    lastActivity: Date | null;
}

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
                updatedAt: true,
                isWorked: true,
                interactionCount: true,
                historico: true,
                consultor: {
                    select: { id: true, name: true, email: true }
                }
            }
        });

        const consultantsMap = new Map<string, ConsultantStat>();

        // Initialize with all potential consultants? 
        // Or just those with leads? 
        // Better to fetch all eligible consultants for the office/campaign first if we want to show zeros.
        // For now, let's just show those with leads + we'll need a way to add new ones in UI.

        // Filter leads to only include those with an assigned consultant
        const consultantsWithLeads = leads.filter(lead => lead.consultorId && lead.consultor);

        consultantsWithLeads.forEach(lead => {
            if (lead.consultor) {
                const cid = lead.consultor.id;

                // Initialize if not exists
                if (!consultantsMap.has(cid)) {
                    consultantsMap.set(cid, {
                        id: cid,
                        name: lead.consultor.name || "Sem Nome",
                        email: lead.consultor.email || "",
                        totalLeads: 0,
                        workedLeads: 0,
                        contactedLeads: 0,
                        closedLeads: 0,
                        lastActivity: null
                    });
                }

                const stats = consultantsMap.get(cid)!; // Non-null assertion safe due to init above
                stats.totalLeads++;

                if (lead.isWorked) stats.workedLeads++;
                if (lead.status === "EM_CONTATO" || lead.status === "EM_NEGOCIACAO") stats.contactedLeads++;
                if (lead.status === "FECHADO") stats.closedLeads++;

                // Track last activity
                if (lead.historico && Array.isArray(lead.historico) && lead.historico.length > 0) {
                    // logic to parse date from history if needed, or check lastInteractionAt
                }
            }
        });

        return NextResponse.json(Array.from(consultantsMap.values()));

    } catch (error) {
        console.error("Error fetching campaign consultants:", error);
        return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
    }
}
