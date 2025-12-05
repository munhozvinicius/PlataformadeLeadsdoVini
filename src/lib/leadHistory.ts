import { prisma } from "@/lib/prisma";
import { LeadHistory } from "@prisma/client";

export type LeadAction =
  | "CREATE"
  | "ASSIGN"
  | "REASSIGN"
  | "RECAPTURE"
  | "STATUS_CHANGE";

type LogLeadActionParams = {
  leadId: string;
  action: LeadAction;
  fromUserId?: string | null;
  toUserId?: string | null;
  byUserId?: string | null;
  notes?: string | null;
};

export async function logLeadAction(params: LogLeadActionParams): Promise<LeadHistory> {
  const { leadId, action, fromUserId, toUserId, byUserId, notes } = params;
  const effectiveUserId = byUserId ?? toUserId ?? fromUserId;
  if (!effectiveUserId) {
    throw new Error("Cannot log lead action without actor user id");
  }
  return prisma.leadHistory.create({
    data: {
      leadId,
      action,
      fromUserId: fromUserId ?? undefined,
      toUserId: toUserId ?? undefined,
      byUserId: byUserId ?? undefined,
      notes: notes ?? undefined,
      userId: effectiveUserId,
    },
  });
}

export function computeLastActivityDate(): Date {
  return new Date();
}

// TODO (Etapa futura): Integrar logLeadAction em criação de lead e mudança de status existentes.
