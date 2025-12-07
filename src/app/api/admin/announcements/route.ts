
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

// Get All Announcements (Admin View - with stats)
export async function GET(req: Request) {
    const session = await getServerSession(authOptions);
    const allowedRoles = [Role.MASTER, Role.GERENTE_SENIOR, Role.GERENTE_NEGOCIOS];

    if (!session?.user || !allowedRoles.includes(session.user.role as Role)) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    try {
        const announcements = await prisma.announcement.findMany({
            orderBy: { createdAt: "desc" },
            include: {
                createdBy: { select: { name: true } },
                _count: { select: { readers: true } }
            }
        });

        // Get total consultants count for "Seen %" calculation
        const totalConsultants = await prisma.user.count({
            where: { role: Role.CONSULTOR, active: true }
        });

        const enriched = announcements.map(a => ({
            ...a,
            totalReaders: a._count.readers,
            totalTargets: totalConsultants,
            seenPercentage: totalConsultants > 0 ? (a._count.readers / totalConsultants) : 0
        }));

        return NextResponse.json(enriched);
    } catch (error) {
        console.error("Error fetching admin announcements:", error);
        return NextResponse.json({ message: "Error" }, { status: 500 });
    }
}

// Create New Announcement
export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    const allowedRoles = [Role.MASTER, Role.GERENTE_SENIOR, Role.GERENTE_NEGOCIOS];

    if (!session?.user || !allowedRoles.includes(session.user.role as Role)) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    try {
        const { title, message, imageUrl } = await req.json();

        if (!title || !message) {
            return NextResponse.json({ message: "Missing fields" }, { status: 400 });
        }

        const announcement = await prisma.announcement.create({
            data: {
                title,
                message,
                imageUrl: imageUrl || null,
                createdById: session.user.id
            }
        });

        return NextResponse.json(announcement);
    } catch (error) {
        console.error("Error creating announcement:", error);
        return NextResponse.json({ message: "Error" }, { status: 500 });
    }
}
