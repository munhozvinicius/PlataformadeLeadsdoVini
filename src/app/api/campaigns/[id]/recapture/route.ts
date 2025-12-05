export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserWithOffices, canRecaptureLeads } from "@/lib/permissions";
import { logLeadAction, computeLastActivityDate } from "@/lib/leadHistory";

type RequestBody = {
  leadIds?: string[];
  newConsultantId?: string;
  reason?: string;
};

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUserWithOffices();
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as RequestBody;
  const leadIds = Array.isArray(body.leadIds)
    ? body.leadIds.filter((id) => typeof id === "string" && id.trim().length > 0)
    : [];
  const newConsultantId = typeof body.newConsultantId === "string" ? body.newConsultantId : "";
  const reason = body.reason ?? null;

  if (!leadIds.length || !newConsultantId) {
    return NextResponse.json({ message: "Dados insuficientes para repescagem." }, { status: 400 });
  }

  const leads = await prisma.lead.findMany({
    where: { id: { in: leadIds }, campanhaId: params.id },
    select: { id: true, officeId: true, consultorId: true },
  });

  const allowed: string[] = [];
  const blocked: string[] = [];
  for (const lead of leads) {
    const allowedOffice = await canRecaptureLeads(user, params.id, lead.officeId ?? undefined);
    if (allowedOffice) {
      allowed.push(lead.id);
    } else {
      blocked.push(lead.id);
    }
  }

  if (!allowed.length) {
    return NextResponse.json({ message: "Nenhum lead permitido para repescagem.", blocked }, { status: 403 });
  }

  const now = computeLastActivityDate();
  await prisma.$transaction(
    allowed.map((leadId) => {
      const lead = leads.find((l) => l.id === leadId);
      const previous = lead?.consultorId;
      return prisma.lead.update({
        where: { id: leadId },
        data: {
          consultorId: newConsultantId,
          assignedToId: newConsultantId,
          previousConsultants: previous ? { push: previous } : undefined,
          lastActivityDate: now,
        },
      });
    })
  );

  await Promise.all(
    allowed.map((leadId) => {
      const lead = leads.find((l) => l.id === leadId);
      return logLeadAction({
        leadId,
        action: "RECAPTURE",
        fromUserId: lead?.consultorId ?? undefined,
        toUserId: newConsultantId,
        byUserId: user.id,
        notes: reason ?? undefined,
      });
    })
  );

  return NextResponse.json({
    processed: allowed,
    blocked,
    message: "Repescagem aplicada. TODO: Integrar com aba de Repescagem (Etapa 4).",
  });
}
