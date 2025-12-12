export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

// Rota legada de importação: por ora, use /api/campanhas/v2
export async function POST() {
  return NextResponse.json(
    { message: "Use /api/campanhas/v2 para criar campanha e importar leads (Cockpit/Mapa Parque)." },
    { status: 501 },
  );
}
