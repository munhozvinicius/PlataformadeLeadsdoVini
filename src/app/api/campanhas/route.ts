import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role, Prisma } from "@prisma/client";
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

        // Check if Campaign exists (Case Insensitive)
        const normalizedName = nome.trim();
        let campanha = await prisma.campanha.findFirst({
            where: {
                nome: { equals: normalizedName, mode: "insensitive" }
            }
        });

        if (!campanha) {
            campanha = await prisma.campanha.create({
                data: campaignData,
            });
        } else {
            // If exists, strictly speaking we might want to update description or owners if provided?
            // For now, let's just reuse it to prevent duplicates which is the main user pain point.
            // keeping original owners/description to avoid overwriting with potentially empty fields.
        }

        let importedCount = 0;

        if (file) {
            const buffer = await file.arrayBuffer();
            const workbook = XLSX.read(buffer, { type: "buffer" });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet) as Record<string, unknown>[];

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
            const leadsToCreate = jsonData.map((row) => ({
                campanhaId: campanha.id,
                importBatchId: batch.id,
                nomeFantasia: typeof row["Nome Fantasia"] === 'string' ? row["Nome Fantasia"] : (String(row["Nome"] || row["Cliente"] || "")),
                razaoSocial: typeof row["Razão Social"] === 'string' ? row["Razão Social"] : (String(row["Empresa"] || "")),
                cnpj: row["CNPJ"] ? String(row["CNPJ"]) : undefined,
                telefone: (row["Telefone"] || row["Telefone 1"] || row["Celular"]) ? String(row["Telefone"] || row["Telefone 1"] || row["Celular"]) : undefined,
                email: (row["Email"] || row["E-mail"]) ? String(row["Email"] || row["E-mail"]) : undefined,
                cidade: row["Cidade"] ? String(row["Cidade"]) : undefined,
                estado: (row["Estado"] || row["UF"]) ? String(row["Estado"] || row["UF"]) : undefined,
                status: "NOVO" as const,
                externalData: row as Prisma.InputJsonValue,
            }));

            if (leadsToCreate.length > 0) {
                await prisma.lead.createMany({
                    data: leadsToCreate,
                });
            }

            // Update Campaign Counts
            await prisma.campanha.update({
                where: { id: campanha.id },
                data: {
                    totalLeads: { increment: importedCount },
                    remainingLeads: { increment: importedCount },
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
