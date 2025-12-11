import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const nome = formData.get("nome")?.toString() ?? null;
    const office = formData.get("office")?.toString() ?? null;
    const campaignType = formData.get("campaignType")?.toString() ?? null;
    return NextResponse.json(
      { ok: true, debug: { nome, office, campaignType } },
      { status: 201 },
    );
  } catch (error) {
    console.error("DEBUG /api/campanhas/v2", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
