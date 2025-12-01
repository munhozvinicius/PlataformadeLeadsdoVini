import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { companyAccessFilter, getSessionUser } from "@/lib/auth-helpers";
import Company from "@/models/Company";

export async function GET(req: NextRequest) {
  await connectToDatabase();
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const searchParams = req.nextUrl.searchParams;
  const campaignId = searchParams.get("campaignId");
  const assignedTo = searchParams.get("assignedTo");
  const stage = searchParams.get("stage");

  const filter: Record<string, unknown> = {};
  if (campaignId) filter.campaign = campaignId;
  if (stage) filter.stage = stage;

  if (sessionUser.role === "MASTER") {
    if (assignedTo) filter.assignedTo = assignedTo;
  } else if (sessionUser.role === "OWNER") {
    Object.assign(filter, await companyAccessFilter(sessionUser));
  } else {
    filter.assignedTo = sessionUser.id;
  }

  const companies = await Company.find(filter)
    .populate("campaign", "name")
    .populate("assignedTo", "name email role owner")
    .sort({ updatedAt: -1 });

  return NextResponse.json(companies);
}
