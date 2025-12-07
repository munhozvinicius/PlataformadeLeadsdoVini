
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Mark as Read
export async function POST(req: Request, { params }: { params: { id: string } }) {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    try {
        await prisma.announcementRead.create({
            data: {
                announcementId: params.id,
                userId: session.user.id
            }
        });

        return NextResponse.json({ success: true });
    } catch {
        // Ignore unique constraint violation (already read)
        return NextResponse.json({ success: true });
    }
}
