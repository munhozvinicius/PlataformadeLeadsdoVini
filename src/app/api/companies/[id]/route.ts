export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import Company from "@/models/Company";
import { companyAccessFilter, getSessionUser } from "@/lib/auth-helpers";

type Params = { params: { id: string } };

export async function PATCH(req: Request, { params }: Params) {
  await connectToDatabase();
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { stage } = body;

  const filter: Record<string, unknown> = { _id: params.id };
  if (sessionUser.role === "MASTER") {
    // all good
  } else if (sessionUser.role === "OWNER") {
    Object.assign(filter, await companyAccessFilter(sessionUser));
  } else {
    filter.assignedTo = sessionUser.id;
  }

  const company = await Company.findOne(filter);
  if (!company) {
    return NextResponse.json({ message: "Not found or unauthorized" }, { status: 404 });
  }

  if (stage) {
    company.stage = stage;
  }

  await company.save();
  return NextResponse.json(company);
}
