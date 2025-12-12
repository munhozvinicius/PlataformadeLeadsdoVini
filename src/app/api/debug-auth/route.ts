import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET() {
    const session = await getServerSession(authOptions);

    return NextResponse.json({
        message: "Debug Session Info",
        session: session || "No session found",
        timestamp: new Date().toISOString(),
        env: {
            NEXTAUTH_URL: process.env.NEXTAUTH_URL,
            VERCEL_URL: process.env.VERCEL_URL
        }
    });
}
