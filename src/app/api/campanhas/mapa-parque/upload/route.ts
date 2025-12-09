import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";

const sanitize = (value: unknown): string => {
    if (!value) return "";
    return String(value).trim();
};

const parseIntSafe = (value: unknown): number => {
    if (!value) return 0;
    const clean = String(value).replace(/\D/g, "");
    return parseInt(clean, 10) || 0;
};

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        const allowedRoles: string[] = [Role.MASTER, Role.GERENTE_SENIOR, Role.GERENTE_NEGOCIOS, Role.PROPRIETARIO];

        if (!session?.user || !allowedRoles.includes(session.user.role || "")) {
            return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        }

        const formData = await req.formData();
        const file = formData.get("file") as File;
        const campaignName = formData.get("campaignName") as string;

        if (!file || !campaignName) {
            return NextResponse.json({ message: "Arquivo e nome da campanha são obrigatórios." }, { status: 400 });
        }

        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "buffer" });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const jsonData: Record<string, any>[] = XLSX.utils.sheet_to_json(worksheet);

        if (jsonData.length === 0) {
            return NextResponse.json({ message: "Arquivo vazio ou inválido." }, { status: 400 });
        }

        // Validate basic structure (CNPJ check)
        const firstRow = jsonData[0];
        const keys = Object.keys(firstRow);
        const hasCnpj = keys.some(k => k.toUpperCase().includes("CNPJ"));

        if (!hasCnpj) {
            return NextResponse.json({ message: "Coluna 'NR_CNPJ' não encontrada no arquivo." }, { status: 400 });
        }

        const officeIds = formData.getAll("officeIds") as string[];

        // Check if Campaign exists
        let campanha = await prisma.campanha.findFirst({
            where: {
                nome: campaignName
            }
        });

        if (campanha) {
            // Update totals & connect offices if new ones provided
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const dataToUpdate: any = {
                totalLeads: { increment: jsonData.length },
                remainingLeads: { increment: jsonData.length },
                // If officeIds are provided, add them to the list (merge)
                // Note: Prisma connect simply connects, doesn't duplicate if already connected usually
                // But for M:N with explicit IDs array, we might need to handle differently or just use connect.
                // Since we added `officeRecords` relation, let's use that.
            };

            if (officeIds.length > 0) {
                dataToUpdate.officeRecords = {
                    connect: officeIds.map(id => ({ id }))
                };
            }

            campanha = await prisma.campanha.update({
                where: { id: campanha.id },
                data: dataToUpdate
            });
        } else {
            // Create Campaign
            campanha = await prisma.campanha.create({
                data: {
                    nome: campaignName,
                    descricao: "Campanha Mapa Parque (Importação CSV)",
                    observacoes: "MAPA_PARQUE_FLOW",
                    createdById: session.user.id,
                    totalLeads: jsonData.length,
                    remainingLeads: jsonData.length,
                    officeRecords: {
                        connect: officeIds.map(id => ({ id }))
                    }
                }
            });
        }

        let leadsCreated = 0;

        // Process Leads
        // Using sequential for safety, can optimize later.
        for (const row of jsonData) {

            // Extract Standard Fields
            const cnpj = sanitize(row["NR_CNPJ"]);
            // If no CNPJ, skip (or generate ID?) - skipping for now as it's the key.
            if (!cnpj) continue;

            const razaoSocial = sanitize(row["NM_CLIENTE"]);
            const vertical = sanitize(row["VERTICAL"]);
            const cidade = sanitize(row["DS_CIDADE"]);
            const cep = sanitize(row["NR_CEP"]);
            const numero = sanitize(row["NUMERO"]);
            const logradouro = sanitize(row["DS_ENDERECO"]);

            // Extract Mapa Parque Specific Data
            const mapaParqueData = {
                // Product Counts
                qtMovelTerm: parseIntSafe(row["QT_MOVEL_TERM"]),
                qtMovelPen: parseIntSafe(row["QT_MOVEL_PEN"]),
                qtMovelM2m: parseIntSafe(row["QT_MOVEL_M2M"]),
                qtBasicaFibra: parseIntSafe(row["QT_BASICA_TERM_FIBRA"]),
                qtBasicaMetalico: parseIntSafe(row["QT_BASICA_TERM_METALICO"]),
                qtBasicaBl: parseIntSafe(row["QT_BASICA_BL"]),
                qtBlFtth: parseIntSafe(row["QT_BL_FTTH"]),
                qtBlFttc: parseIntSafe(row["QT_BL_FTTC"]),
                qtBasicaTv: parseIntSafe(row["QT_BASICA_TV"]),
                qtBasicaOutros: parseIntSafe(row["QT_BASICA_OUTROS"]),
                qtBasicaLinhas: parseIntSafe(row["QT_BASICA_LINAS"]),
                qtAvancadaDados: parseIntSafe(row["QT_AVANCADA_DADOS"]),
                avancadaVoz: parseIntSafe(row["AVANCADA_VOZ"]),
                qtVivoTech: parseIntSafe(row["QT_VIVO_TECH"]),
                qtVvn: parseIntSafe(row["QT_VVN"]),

                // Flags & Info
                dataFimVtech: sanitize(row["DATA_FIM_VTECH"]),
                flgTrocaVtech: sanitize(row["FLG_TROCA_VTECH"]),
                flgPqDigital: sanitize(row["FLG_PQ_DIGITAL"]),
                flgCliBiometrado: sanitize(row["FLG_CLI_BIOMETRADO"]),
                qtdSfaFiliais: parseIntSafe(row["QTD_SFA_FILIAIS"]),
                tpProduto: sanitize(row["TP_PRODUTO"]),
                nomerede: sanitize(row["NOMEREDE"]),

                // Contacts (Extra)
                nmContatoSfa: sanitize(row["NM_CONTATO_SFA"]),
                emailContatoSfa: sanitize(row["EMAIL_CONTATO_PRINCIPAL_SFA"]),
                celularContatoSfa: sanitize(row["CELULAR_CONTATO_PRINCIPAL_SFA"]),

                // Phones
                tlfn1: sanitize(row["TLFN_1"]),
                tlfn2: sanitize(row["TLFN_2"]),
                tlfn3: sanitize(row["TLFN_3"]),
                tlfn4: sanitize(row["TLFN_4"]),
                tlfn5: sanitize(row["TLFN_5"]),
                telComercialSiebel: sanitize(row["TEL_COMERCIAL_SIEBEL"]),
                telCelularSiebel: sanitize(row["TEL_CELULAR_SIEBEL"]),
                telResidencialSiebel: sanitize(row["TEL_RESIDENCIAL_SIEBEL"]),
            };

            // Construct Phones Data for standard field (optional, but good for searchability)
            // Storing specifically in externalData mostly as requested layout relies on it.

            await prisma.lead.create({
                data: {
                    campanhaId: campanha.id,
                    cnpj,
                    razaoSocial,
                    nomeFantasia: razaoSocial, // Default to same
                    vertical: vertical,
                    cidade: cidade,
                    estado: "", // No explicit state field in provided list
                    cep: cep,
                    numero: numero,
                    logradouro: logradouro,
                    endereco: `${logradouro}, ${numero} - ${cidade}`,

                    // Store the specific data map
                    externalData: {
                        mapaParque: mapaParqueData
                    },

                    // Populate standard contacts if possible
                    contatoPrincipal: {
                        nome: mapaParqueData.nmContatoSfa,
                        email: mapaParqueData.emailContatoSfa,
                        telefone: mapaParqueData.celularContatoSfa
                    },

                    // Populate email array
                    emails: mapaParqueData.emailContatoSfa ? [mapaParqueData.emailContatoSfa] : [],
                }
            });
            leadsCreated++;
        }

        return NextResponse.json({
            success: true,
            leadsCount: leadsCreated,
            campaignId: campanha.id
        });

    } catch (error) {
        console.error("Error creating Mapa Parque campaign:", error);
        return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
    }
}
