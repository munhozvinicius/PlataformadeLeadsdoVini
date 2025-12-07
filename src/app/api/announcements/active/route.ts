
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";


export const dynamic = "force-dynamic";

export async function GET() {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    // Only active announcements
    // NOT read by this user
    try {
        const activeAnnouncements = await prisma.announcement.findMany({
            where: {
                active: true,
                readers: {
                    none: {
                        userId: session.user.id
                    }
                }
            },
            orderBy: { createdAt: "desc" }
        });

        return NextResponse.json(activeAnnouncements);
    } catch (error) {
        console.error("Error fetching active announcements:", error);
        return NextResponse.json({ message: "Error" }, { status: 500 });
    }
}
