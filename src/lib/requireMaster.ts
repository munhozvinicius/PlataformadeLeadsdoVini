import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Profile } from "@prisma/client";

type RequireMasterSuccess = { user: { id: string; profile: Profile } };
type RequireMasterFailure = { response: ReturnType<typeof NextResponse.json> };

export async function requireMaster(): Promise<RequireMasterSuccess | RequireMasterFailure> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, profile: true },
  });

  if (!user) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  if (user.profile !== Profile.MASTER) {
    return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { user };
}
