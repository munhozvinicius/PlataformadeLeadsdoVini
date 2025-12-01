export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { companyAccessFilter, getSessionUser } from "@/lib/auth-helpers";
import Company from "@/models/Company";
import LeadActivity from "@/models/LeadActivity";
import { StageId } from "@/constants/stages";

export async function GET(req: NextRequest) {
  await connectToDatabase();
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const companyId = req.nextUrl.searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json({ message: "companyId is required" }, { status: 400 });
  }

  const companyFilter: Record<string, unknown> = { _id: companyId };
  if (sessionUser.role === "MASTER") {
    // allowed
  } else if (sessionUser.role === "OWNER") {
    Object.assign(companyFilter, await companyAccessFilter(sessionUser));
  } else {
    companyFilter.assignedTo = sessionUser.id;
  }

  const company = await Company.findOne(companyFilter);
  if (!company) {
    return NextResponse.json({ message: "Not found or unauthorized" }, { status: 404 });
  }

  const activities = await LeadActivity.find({ company: companyId })
    .populate("user", "name email role")
    .sort({ createdAt: -1 });

  return NextResponse.json(activities);
}

export async function POST(req: Request) {
  await connectToDatabase();
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const {
    companyId,
    kind = "CONTATO",
    channel = null,
    outcomeCode,
    outcomeLabel,
    note,
    newStage,
  } = body;

  if (!companyId || !note) {
    return NextResponse.json({ message: "companyId and note are required" }, { status: 400 });
  }

  const companyFilter: Record<string, unknown> = { _id: companyId };
  if (sessionUser.role === "MASTER") {
    // allowed
  } else if (sessionUser.role === "OWNER") {
    Object.assign(companyFilter, await companyAccessFilter(sessionUser));
  } else {
    companyFilter.assignedTo = sessionUser.id;
  }

  const company = await Company.findOne(companyFilter);
  if (!company) {
    return NextResponse.json({ message: "Not found or unauthorized" }, { status: 404 });
  }

  const stageBefore = company.stage as StageId | null;
  if (newStage && newStage !== company.stage) {
    company.stage = newStage;
  }
  const stageAfter = (newStage ?? company.stage) as StageId | null;

  company.isWorked = true;
  company.lastActivityAt = new Date();
  if (outcomeCode || outcomeLabel) {
    company.lastOutcomeCode = outcomeCode;
    company.lastOutcomeLabel = outcomeLabel;
  }
  company.lastOutcomeNote = note;
  await company.save();

  const activity = await LeadActivity.create({
    company: company._id,
    user: sessionUser.id,
    kind,
    stageBefore,
    stageAfter,
    channel,
    outcomeCode,
    outcomeLabel,
    note,
  });

  return NextResponse.json(activity, { status: 201 });
}
