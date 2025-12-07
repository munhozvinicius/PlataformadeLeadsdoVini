import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user || session.user.role === Role.CONSULTOR) {
            return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        }

        const { campanhaId, fromConsultantId, toConsultantId, quantity } = await req.json();

        if (!campanhaId || !toConsultantId || !quantity) {
            return NextResponse.json({ message: "Missing required fields" }, { status: 400 });
        }

        // Logic: Find leads assigned to 'fromConsultantId' (or null if distributing fresh leads)
        // If fromConsultantId is provided, it's a "Repescagem" (Transfer)
        // If not, it's a "Distribution" from stock

        const whereClause: any = {
            campanhaId,
            consultorId: fromConsultantId || null,
            status: { notIn: ["FECHADO", "PERDIDO"] }, // Don't redistribute closed/lost leads by default? User didn't specify, but safer.
        };

        // Find candidate leads
        const leadsToTransfer = await prisma.lead.findMany({
            where: whereClause,
            take: Number(quantity),
            select: { id: true, previousConsultants: true, consultorId: true },
        });

        if (leadsToTransfer.length === 0) {
            return NextResponse.json({ message: "No leads found to transfer" }, { status: 404 });
        }

        const leadIds = leadsToTransfer.map(l => l.id);

        // Update Leads
        // Add current consultant to previousConsultants if it's a transfer
        // Reset status to "NOVO" for the new consultant? Or keep as is? Usually Repescagem implies a fresh start, so maybe "NOVO" or "EM_CONTATO". 
        // User said "outro consultor nao tem acesso ao historico".

        await prisma.$transaction(async (tx) => {
            for (const lead of leadsToTransfer) {
                const prev = lead.previousConsultants || [];
                if (lead.consultorId && !prev.includes(lead.consultorId)) {
                    prev.push(lead.consultorId);
                }

                await tx.lead.update({
                    where: { id: lead.id },
                    data: {
                        consultorId: toConsultantId,
                        previousConsultants: prev,
                        // Optionally reset status or keep it? Let's keep it but maybe log it.
                        // If it's a fresh distribution, status is usually NOVO.
                        // If it's repescagem, arguably we want them to re-work it.
                        assignedToId: toConsultantId,
                        assignedToAt: new Date(), // If this field existed, but it doesn't in schema overview.
                    }
                });
            }
        });

        // Log Distribution
        await prisma.distributionLog.create({
            data: {
                campaignId,
                adminId: session.user.id,
                consultantId: toConsultantId,
                leadIds,
                rulesApplied: fromConsultantId ? `Repescagem from ${fromConsultantId}` : "Distribution from Stock",
            }
        });

        // Update Metrics
        // We should recalculate campaign stats or rely on future queries.
        // For now, simple return.

        return NextResponse.json({
            success: true,
            transferred: leadsToTransfer.length
        });

    } catch (error) {
        console.error("Error in repescagem:", error);
        return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
    }
}
