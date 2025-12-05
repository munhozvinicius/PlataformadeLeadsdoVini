export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

type Params = { params: { id: string } };

export async function DELETE(_req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== Role.MASTER) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const batchId = params.id;

  try {
    const batch = await prisma.importBatch.findUnique({ where: { id: batchId } });
    if (!batch) {
      return NextResponse.json({ error: "Lote não encontrado." }, { status: 404 });
    }

    const leads = await prisma.lead.findMany({
      where: { importBatchId: batchId },
      select: { id: true },
    });
    const leadIds = leads.map((l) => l.id);

    if (leadIds.length > 0) {
      await prisma.leadHistory.deleteMany({ where: { leadId: { in: leadIds } } });
      await prisma.leadActivity.deleteMany({ where: { leadId: { in: leadIds } } });
      await prisma.lead.deleteMany({ where: { id: { in: leadIds } } });
    }

    await prisma.importBatch.delete({ where: { id: batchId } });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("[DELETE_IMPORT_BATCH_ERROR]", error);
    return NextResponse.json(
      { error: "Erro ao excluir lote. Verifique dependências ou logs." },
      { status: 500 }
    );
  }
}
