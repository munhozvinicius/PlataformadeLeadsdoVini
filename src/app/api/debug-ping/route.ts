import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { ok: true, message: "debug-ping funcionando" },
    { status: 201 },
  );
}
