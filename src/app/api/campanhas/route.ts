import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import * as XLSX from "xlsx";

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user || session.user.role === Role.CONSULTOR) {
            return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        }

        const formData = await req.formData();
        const nome = formData.get("nome") as string;
        const descricao = formData.get("descricao") as string;
        const gnId = formData.get("gnId") as string;
        const gsId = formData.get("gsId") as string;
        const ownerId = formData.get("ownerId") as string;
        const file = formData.get("file") as File;

        if (!nome) {
            return NextResponse.json({ message: "Nome da campanha é obrigatório" }, { status: 400 });
        }

        // Prepare Campaign Data
        const campaignData: any = {
            nome,
            descricao,
            createdById: session.user.id,
            assignedLeads: 0,
            remainingLeads: 0,
            totalLeads: 0,
        };

        if (gnId) campaignData.gnId = gnId;
        if (gsId) campaignData.gsId = gsId;
        if (ownerId) campaignData.ownerId = ownerId;

        // Create Campaign First
        const campanha = await prisma.campanha.create({
            data: campaignData,
        });

        let importedCount = 0;

        if (file) {
            const buffer = await file.arrayBuffer();
            const workbook = XLSX.read(buffer, { type: "buffer" });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

            importedCount = jsonData.length;

            // Create Import Batch
            const batch = await prisma.importBatch.create({
                data: {
                    nomeArquivoOriginal: file.name,
                    campaignId: campanha.id,
                    totalLeads: importedCount,
                    importedLeads: importedCount,
                    status: "completed",
                    criadoPorId: session.user.id,
                },
            });

            // Prepare Leads for Bulk Insert
            // Note: Mapping logic assumes headers match standard lead fields or loosely maps them
            const leadsToCreate = jsonData.map((row) => ({
                campanhaId: campanha.id,
                importBatchId: batch.id,
                nomeFantasia: row["Nome Fantasia"] || row["Nome"] || row["Cliente"] || "",
                razaoSocial: row["Razão Social"] || row["Empresa"] || "",
                cnpj: row["CNPJ"] ? String(row["CNPJ"]) : undefined,
                telefone: row["Telefone"] ? String(row["Telefone"]) : undefined,
                email: row["Email"] || row["E-mail"] || undefined,
                cidade: row["Cidade"] || undefined,
                estado: row["Estado"] || row["UF"] || undefined,
                status: "NOVO",
                externalData: row, // Store original row data as JSON
            }));

            if (leadsToCreate.length > 0) {
                await prisma.lead.createMany({
                    data: leadsToCreate as any, // Type assertion might be needed due to strict prisma types on createMany
                });
            }

            // Update Campaign Counts
            await prisma.campanha.update({
                where: { id: campanha.id },
                data: {
                    totalLeads: importedCount,
                    remainingLeads: importedCount,
                },
            });
        }

        return NextResponse.json({
            success: true,
            campanhaId: campanha.id,
            importedCount
        }, { status: 201 });

    } catch (error) {
        console.error("Error creating campaign:", error);
        return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
    }
}
