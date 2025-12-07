import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role, Prisma } from "@prisma/client";

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role === Role.CONSULTOR) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const data = await req.json();
    const { nome, descricao, gnId, gsId, ownerId } = data;

    const updateData: Prisma.CampanhaUpdateInput = {};
    if (nome !== undefined) updateData.nome = nome;
    if (descricao !== undefined) updateData.descricao = descricao;
    if (gnId !== undefined) updateData.gn = gnId ? { connect: { id: gnId } } : { disconnect: true };
    if (gsId !== undefined) updateData.gs = gsId ? { connect: { id: gsId } } : { disconnect: true };
    if (ownerId !== undefined) updateData.owner = ownerId ? { connect: { id: ownerId } } : { disconnect: true };

    const campanha = await prisma.campanha.update({
      where: { id: params.id },
      data: updateData,
    });

    return NextResponse.json(campanha);
  } catch (error) {
    console.error("Error updating campaign:", error);
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !["MASTER", "PROPRIETARIO"].includes(session.user.role)) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const campanhaId = params.id;

    // Cascade delete using transaction
    await prisma.$transaction(async (tx) => {
      // 1. Delete Leads
      await tx.lead.deleteMany({ where: { campanhaId } });
      // 2. Delete Activities
      await tx.leadActivity.deleteMany({ where: { campaignId: campanhaId } });
      // 3. Delete Import Batches
      await tx.importBatch.deleteMany({ where: { campaignId: campanhaId } });
      // 4. Delete Distribution Logs
      await tx.distributionLog.deleteMany({ where: { campaignId: campanhaId } });
      // 5. Delete Campaign
      await tx.campanha.delete({ where: { id: campanhaId } });
    });

    return NextResponse.json({ success: true, message: "Campaign deleted successfully" });
  } catch (error) {
    console.error("Error deleting campaign:", error);
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}
