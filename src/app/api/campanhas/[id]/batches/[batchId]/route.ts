import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(req: Request, { params }: { params: { id: string, batchId: string } }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user || !["MASTER", "PROPRIETARIO", "GERENTE_SENIOR", "GERENTE_NEGOCIOS"].includes(session.user.role)) {
            return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        }

        const { id: campaignId, batchId } = params;

        // Transaction to remove leads from this batch and the batch itself
        // Note: Removing leads will affect campaign stats. Need to update them.

        await prisma.$transaction(async (tx) => {
            // 1. Get count of leads to be deleted (to update campaign stats if needed, or we just recount)
            const deletedLeads = await tx.lead.deleteMany({
                where: { importBatchId: batchId, campanhaId: campaignId }
            });

            // 2. Delete the batch
            await tx.importBatch.delete({
                where: { id: batchId }
            });

            // 3. Recalculate Campaign Stats (safer than increment/decrement)
            const remaining = await tx.lead.count({ where: { campanhaId: campaignId, consultorId: null, status: { notIn: ["FECHADO", "PERDIDO"] } } }); // Approximation of remaining
            const total = await tx.lead.count({ where: { campanhaId: campaignId } });
            const assigned = total - remaining; // Rough approx, or count assigned specifically

            await tx.campanha.update({
                where: { id: campaignId },
                data: {
                    totalLeads: total,
                    remainingLeads: remaining,
                    assignedLeads: assigned
                }
            });
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error deleting batch:", error);
        return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
    }
}
