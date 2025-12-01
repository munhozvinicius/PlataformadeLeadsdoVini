import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/mongodb";
import { getSessionUser } from "@/lib/auth-helpers";
import Company from "@/models/Company";
import LeadActivity from "@/models/LeadActivity";

export async function GET(req: Request) {
  await connectToDatabase();
  const sessionUser = await getSessionUser();
  if (!sessionUser || sessionUser.role !== "MASTER") {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const campaignId = searchParams.get("campaignId");

  const match: Record<string, unknown> = {};
  if (campaignId) match.campaign = campaignId;

  const totalLeads = await Company.countDocuments(match);
  const workedLeads = await Company.countDocuments({ ...match, isWorked: true });

  const byStage = await Company.aggregate([
    { $match: match },
    { $group: { _id: "$stage", count: { $sum: 1 } } },
    { $project: { stage: "$_id", count: 1, _id: 0 } },
  ]);

  let outcomes: { outcomeLabel: string; count: number }[] = [];
  if (campaignId) {
    const campaignObjectId = new mongoose.Types.ObjectId(campaignId);
    outcomes = await LeadActivity.aggregate([
      {
        $lookup: {
          from: "companies",
          localField: "company",
          foreignField: "_id",
          as: "companyDoc",
        },
      },
      { $unwind: "$companyDoc" },
      { $match: { "companyDoc.campaign": campaignObjectId } },
      {
        $group: {
          _id: "$outcomeLabel",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
      { $project: { outcomeLabel: "$_id", count: 1, _id: 0 } },
    ]);
  } else {
    outcomes = await LeadActivity.aggregate([
      {
        $group: {
          _id: "$outcomeLabel",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
      { $project: { outcomeLabel: "$_id", count: 1, _id: 0 } },
    ]);
  }

  return NextResponse.json({
    totalLeads,
    workedLeads,
    byStage,
    outcomes,
  });
}
