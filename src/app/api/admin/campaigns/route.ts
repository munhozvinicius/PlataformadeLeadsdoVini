export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import Campaign from "@/models/Campaign";
import { getSessionUser } from "@/lib/auth-helpers";

export async function GET() {
  await connectToDatabase();
  const sessionUser = await getSessionUser();
  if (!sessionUser || sessionUser.role !== "MASTER") {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const campaigns = await Campaign.find().sort({ createdAt: -1 });
  return NextResponse.json(campaigns);
}

export async function POST(req: Request) {
  await connectToDatabase();
  const sessionUser = await getSessionUser();
  if (!sessionUser || sessionUser.role !== "MASTER") {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { name, description } = await req.json();
  if (!name) {
    return NextResponse.json({ message: "Name is required" }, { status: 400 });
  }

  const campaign = await Campaign.create({
    name,
    description,
    createdBy: sessionUser.id,
  });

  return NextResponse.json(campaign, { status: 201 });
}
