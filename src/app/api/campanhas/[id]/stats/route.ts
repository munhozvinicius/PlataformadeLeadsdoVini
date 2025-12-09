
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        }

        const campaignId = params.id;

        // 1. Fetch User with Hierarchy Context
        const currentUser = await prisma.user.findUnique({
            where: { id: session.user.id },
            include: {
                managedOffices: true,
                ownedOffices: true,
            },
        });

        if (!currentUser) return NextResponse.json({ message: "User not found" }, { status: 404 });

        // 2. RBAC Check for Campaign Access
        // 2. RBAC Check for Campaign Access
        const campaign = await prisma.campanha.findUnique({
            where: { id: campaignId },
            // include: { office: true } // Removed: Office is an Enum
        });

        if (!campaign) return NextResponse.json({ message: "Campaign not found" }, { status: 404 });

        let hasAccess = false;
        if (currentUser.role === Role.MASTER || currentUser.role === Role.GERENTE_SENIOR) {
            hasAccess = true;
        } else if (currentUser.role === Role.GERENTE_NEGOCIOS) {
            if (campaign.gnId === currentUser.id) hasAccess = true;
        } else if (currentUser.role === Role.PROPRIETARIO) {
            if (campaign.ownerId === currentUser.id) hasAccess = true;
        }

        if (!hasAccess && campaign.createdById === currentUser.id) hasAccess = true;

        if (!hasAccess) {
            return NextResponse.json({ message: "Forbidden" }, { status: 403 });
        }

        // 3. Aggregate Stats

        // Total Leads
        const totalLeads = await prisma.lead.count({
            where: { campanhaId: campaignId }
        });

        // Stock (Unassigned or explicitly NOVO and unassigned)
        const stockLeads = await prisma.lead.count({
            where: {
                campanhaId: campaignId,
                consultorId: null
            }
        });

        // Consultant Stats
        // We want: Count, Time with Lead (Oldest unworked? Or just age of assignment?)
        // "Quanto tempo esta com lead" -> Usually finding the lead assigned longest ago that is still in progress.
        // Let's get leads grouped by consultant.

        // Prisma groupBy doesn't support complex aggregations like "min(assignedAt)" easily with relations in one go effectively for all details.
        // But we can try.

        const assignedStats = await prisma.lead.groupBy({
            by: ['consultorId'],
            where: {
                campanhaId: campaignId,
                consultorId: { not: null }
            },
            _count: {
                id: true
            },
            _min: {
                lastStatusChangeAt: true, // Assuming this tracks assignment time roughly
                updatedAt: true
            },
            _max: {
                lastStatusChangeAt: true
            }
        });

        // We need consultant names.
        const consultantIds = assignedStats
            .map(s => s.consultorId)
            .filter((id): id is string => id !== null);

        const consultants = await prisma.user.findMany({
            where: { id: { in: consultantIds } },
            select: { id: true, name: true, email: true }
        });

        const detailedStats = assignedStats.map(stat => {
            const consultant = consultants.find(c => c.id === stat.consultorId);
            const oldestDate = stat._min.lastStatusChangeAt || stat._min.updatedAt;

            // Calculate duration in hours/days
            const now = new Date();
            const durationMs = oldestDate ? now.getTime() - new Date(oldestDate).getTime() : 0;
            const hoursHeld = Math.floor(durationMs / (1000 * 60 * 60));

            return {
                consultantId: stat.consultorId,
                name: consultant?.name || "Desconhecido",
                email: consultant?.email || "",
                count: stat._count.id,
                oldestAssignment: oldestDate,
                hoursHeld: hoursHeld,
                newestAssignment: stat._max.lastStatusChangeAt
            };
        });

        return NextResponse.json({
            total: totalLeads,
            stock: stockLeads,
            distributed: totalLeads - stockLeads,
            distribution: detailedStats
        });

    } catch (error) {
        console.error("Error fetching campaign stats:", error);
        return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
    }
}
