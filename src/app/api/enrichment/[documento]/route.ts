export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getSessionUser } from "@/lib/auth-helpers";
import Company from "@/models/Company";

type Params = { params: { documento: string } };

// Placeholder to plug external enrichment APIs (ReceitaWS, Serpro, Google Places, etc).
export async function GET(_req: Request, { params }: Params) {
  await connectToDatabase();
  const sessionUser = await getSessionUser();
  if (!sessionUser || sessionUser.role !== "MASTER") {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const company = await Company.findOne({ documento: params.documento });
  if (!company) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    company,
    note: "Plug your official enrichment APIs here (ReceitaWS, Serpro, Google Places API, etc).",
  });
}
