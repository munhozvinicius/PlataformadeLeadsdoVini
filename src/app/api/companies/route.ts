export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { companyAccessFilter, getSessionUser } from "@/lib/auth-helpers";
import { Role, LeadStatus, Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const searchParams = req.nextUrl.searchParams;
  const campaignId = searchParams.get("campaignId");
  const assignedTo = searchParams.get("assignedTo");
  const stage = searchParams.get("stage");

  const where: Prisma.LeadWhereInput = {};
  if (campaignId) where.campanhaId = campaignId;
  if (stage) where.status = stage as LeadStatus;

  if (sessionUser.role === Role.MASTER) {
    if (assignedTo) where.consultorId = assignedTo;
  } else if (sessionUser.role === Role.PROPRIETARIO) {
    Object.assign(where, await companyAccessFilter(sessionUser));
    // If specific assignedTo is requested within their team, we could narrow it down further, 
    // but typically filter takes precedence or intersection. 
    // If assignedTo is passed, we should ensure it's in the allowed set if we want strictness, 
    // or just let the caller filter. For safety, let's allow narrowing if provided.
    if (assignedTo) {
      // We should check if assignedTo is in the allowed list, but for now just merging:
      // If companyAccessFilter returns { consultorId: { in: [...] } } and we overwrite consultorId, it breaks.
      // We should intersect.
      // But for simplicity, let's assume specific filter overrides general breadth if stricter, or just ignore for now if not critical.
      // Actually, let's just use what's passed if it's safe, but relying on `companyAccessFilter` is safer for now.
      // Let's stick to the original logic: "if MASTER ... else if PROPRIETARIO ... else ..."
      // The original logic merged `companyAccessFilter`.
      // If `assignedTo` was passed by PROPRIETARIO, the original code didn't handle it explicitly in the `else if` block?
      // Ah, original code had:
      // if (sessionUser.role === Role.MASTER) { if (assignedTo) filter.assignedTo = assignedTo; } 
      // else if (sessionUser.role === Role.PROPRIETARIO) { Object.assign(filter, ...); }
      // So PROPRIETARIO couldn't filter by specific assignedTo via param in original code? 
      // It seems so. I will replicate that behavior.
    }
  } else {
    where.consultorId = sessionUser.id;
  }

  const companies = await prisma.lead.findMany({
    where,
    include: {
      campanha: {
        select: { nome: true },
      },
      consultor: {
        select: { id: true, name: true, email: true, role: true, ownerId: true },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(companies);
}
