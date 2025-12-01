import { NextResponse } from "next/server";
import type { Types } from "mongoose";
import { connectToDatabase } from "@/lib/mongodb";
import { getSessionUser } from "@/lib/auth-helpers";
import Company from "@/models/Company";
import LeadActivity from "@/models/LeadActivity";

type LastActivity = {
  channel?: string | null;
  createdAt?: Date | string;
};

type LastActivityAgg = { _id: Types.ObjectId; activity: LastActivity };
type ExportCompany = {
  _id: Types.ObjectId;
  empresa?: string;
  documento?: string;
  vertical?: string;
  stage?: string;
  campaign?: Types.ObjectId;
  assignedTo?: { name?: string; email?: string };
  lastActivityAt?: Date | string;
  lastOutcomeLabel?: string;
  lastOutcomeNote?: string;
};

export async function GET(req: Request) {
  await connectToDatabase();
  const sessionUser = await getSessionUser();
  if (!sessionUser || sessionUser.role !== "MASTER") {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const campaignId = searchParams.get("campaignId");

  const filter: Record<string, unknown> = {};
  if (campaignId) filter.campaign = campaignId;

  const companies = (await Company.find(filter)
    .populate("assignedTo", "name email")
    .select(
      "empresa documento vertical stage campaign assignedTo lastActivityAt lastOutcomeLabel lastOutcomeNote"
    )
    .lean()) as ExportCompany[];

  const companyIds = companies.map((c) => c._id);

  const lastActivitiesAgg: LastActivityAgg[] = await LeadActivity.aggregate([
    { $match: { company: { $in: companyIds } } },
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: "$company",
        activity: { $first: "$$ROOT" },
      },
    },
  ]);

  const activityMap = new Map<string, LastActivity>();
  for (const item of lastActivitiesAgg) {
    activityMap.set(item._id.toString(), item.activity);
  }

  const header = [
    "empresa",
    "documento",
    "vertical",
    "stage",
    "campaignId",
    "consultorNome",
    "consultorEmail",
    "lastActivityAt",
    "lastOutcomeLabel",
    "lastOutcomeNote",
    "ultimaAtividadeCanal",
    "ultimaAtividadeCriadaEm",
  ];

  const rows = companies.map((company) => {
    const lastActivity = activityMap.get(company._id.toString());
    return [
      company.empresa ?? "",
      company.documento ?? "",
      company.vertical ?? "",
      company.stage ?? "",
      company.campaign?.toString() ?? "",
      company.assignedTo?.name ?? "",
      company.assignedTo?.email ?? "",
      company.lastActivityAt ? new Date(company.lastActivityAt).toISOString() : "",
      company.lastOutcomeLabel ?? "",
      company.lastOutcomeNote ?? "",
      lastActivity?.channel ?? "",
      lastActivity?.createdAt ? new Date(lastActivity.createdAt).toISOString() : "",
    ].join(";");
  });

  const csv = [header.join(";"), ...rows].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="leads_export.csv"',
    },
  });
}
