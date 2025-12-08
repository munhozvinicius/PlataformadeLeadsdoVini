import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";

// Helper to parse integers safely
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const parseIntSafe = (value: any): number => {
    if (!value) return 0;
    const clean = String(value).replace(/\D/g, ""); // Remove non-digits
    return parseInt(clean, 10) || 0;
};

// Helper to sanitize strings
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sanitize = (value: any): string | null => {
    if (!value) return null;
    return String(value).trim();
};

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        const allowedRoles: string[] = [Role.MASTER, Role.GERENTE_SENIOR, Role.GERENTE_NEGOCIOS];

        if (!session?.user || !allowedRoles.includes(session.user.role || "")) {
            return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        }

        const contentType = req.headers.get("content-type") || "";

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let jsonData: Record<string, any>[] = [];
        let batchId = new Date().toISOString();

        if (contentType.includes("application/json")) {
            const body = await req.json();
            jsonData = body.records || [];
            if (body.batchId) batchId = body.batchId;
        } else {
            const formData = await req.formData();
            const file = formData.get("file") as File;
            const isCompressed = formData.get("isCompressed") === "true";

            if (!file) {
                return NextResponse.json({ message: "File or records required" }, { status: 400 });
            }

            const buffer = await file.arrayBuffer();

            if (isCompressed) {
                try {
                    const { gunzipSync } = await import("fflate");
                    const decompressed = gunzipSync(new Uint8Array(buffer));
                    const jsonString = new TextDecoder().decode(decompressed);
                    jsonData = JSON.parse(jsonString);
                } catch (err) {
                    console.error("Decompression error:", err);
                    return NextResponse.json({ message: "Failed to decompress/parse file" }, { status: 400 });
                }
            } else {
                // Legacy / Direct Excel Upload
                const workbook = XLSX.read(buffer, { type: "buffer" });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                jsonData = XLSX.utils.sheet_to_json(worksheet);
            }
        }

        console.log("Upload Debug - Rows found:", jsonData.length);
        if (jsonData.length > 0) {
            console.log("Upload Debug - First Row Keys:", Object.keys(jsonData[0]));
        } else {
            console.log("Upload Debug - No rows found");
        }


        const stats = {
            created: 0,
            updated: 0,
            historyCreated: 0,
            errors: 0
        };

        // Validate presence of critical column
        if (jsonData.length > 0) {
            const keys = Object.keys(jsonData[0]);
            // Check if NR_CNPJ exists (looser check)
            const cnpjKey = keys.find(k => k.toUpperCase().includes("CNPJ"));
            if (!cnpjKey) {
                return NextResponse.json({
                    message: `Coluna de CNPJ não encontrada (procurando por 'CNPJ'). Colunas detectadas: ${keys.slice(0, 5).join(", ")}...`
                }, { status: 400 });
            }

            // Remap the found key to "NR_CNPJ" for the loop below if needed,
            // but easier to just use the found key in the loop.
        }

        // Process in chunks or sequentially? Sequentially is safer for logic, but might be slow.
        // For V1, let's do sequential loop but optimize with transactions if needed.
        // Given complexity of "History", standard loop is best.

        // Pre-fetch users to optimize lookup (caching emails -> officeName)
        // This avoids querying DB for every row
        const users = await prisma.user.findMany({
            where: { active: true },
            select: { email: true, officeRecord: { select: { name: true } } }
        });

        const consultantOfficeMap = new Map<string, string>();
        users.forEach(u => {
            if (u.email && u.officeRecord?.name) {
                consultantOfficeMap.set(u.email.toLowerCase(), u.officeRecord.name);
            }
        });

        // Prepare objects for processing
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const preparedRows: { cnpj: string; row: any }[] = [];

        for (const row of jsonData) {
            const rowKeys = Object.keys(row);
            const cnpjKey = rowKeys.find(k => k.toUpperCase().includes("CNPJ")) || "NR_CNPJ";
            const cnpj = sanitize(row[cnpjKey]);
            if (cnpj) {
                preparedRows.push({ cnpj, row });
            }
        }

        // Process in batches to control concurrency
        const BATCH_SIZE = 20;
        for (let i = 0; i < preparedRows.length; i += BATCH_SIZE) {
            const batch = preparedRows.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(async ({ cnpj, row }) => {
                try {
                    const loginConsultor = sanitize(row["LOGINCONSULTOR"]);
                    let officeName = null;

                    // Try to resolve office from consultant email
                    if (loginConsultor) {
                        const mappedOffice = consultantOfficeMap.get(loginConsultor.toLowerCase());
                        if (mappedOffice) {
                            officeName = mappedOffice;
                        }
                    }

                    // Mapping fields
                    const newData = {
                        codCliente: sanitize(row["COD_CLIENTE"]),
                        razaoSocial: sanitize(row["NM_CLIENTE"]),
                        nomeFantasia: sanitize(row["NM_CLIENTE"]), // Map same if not separate
                        endereco: sanitize(row["DS_ENDERECO"]),
                        numero: sanitize(row["NUMERO"]),
                        cep: sanitize(row["NR_CEP"]),
                        // bairro: ? Not in list provided
                        cidade: sanitize(row["DS_CIDADE"]),
                        // uf: ?
                        statusSfa: sanitize(row["STATUS_SFA"]), // Assuming column name

                        situacaoReceita: sanitize(row["SITUACAO_RECEITA"]),
                        vertical: sanitize(row["VERTICAL"]),
                        atividadeEconomica: sanitize(row["DS_ATIVIDADE_ECONOMICA"]),
                        // cnae: ?

                        nomerede: sanitize(row["NOMEREDE"]),
                        nomeGn: sanitize(row["NOMEGN"]),
                        nomeGerenteDivisao: sanitize(row["NOMEGERENTEDIVISAO"]),
                        loginConsultor: loginConsultor, // CRITICAL for ownership
                        adabasMovel: sanitize(row["ADABASMOVEL"]),
                        adabasFixa: sanitize(row["ADABASFIXA"]),

                        officeName: officeName,

                        // Metrics
                        qtMovelTerm: parseIntSafe(row["QT_MOVEL_TERM"]),
                        qtMovelPen: parseIntSafe(row["QT_MOVEL_PEN"]),
                        qtM2m: parseIntSafe(row["QT_MOVEL_M2M"]),
                        qtFwt: parseIntSafe(row["QT_MOVEL_FWT"]),
                        qtBasicaFibra: parseIntSafe(row["QT_BASICA_TERM_FIBRA"]),
                        qtBasicaMetalico: parseIntSafe(row["QT_BASICA_TERM_METALICO"]),
                        qtBasicaBl: parseIntSafe(row["QT_BASICA_BL"]),
                        qtBlFtth: parseIntSafe(row["QT_BL_FTTH"]),
                        qtBlFttc: parseIntSafe(row["QT_BL_FTTC"]),
                        qtBasicaTv: parseIntSafe(row["QT_BASICA_TV"]),
                        qtBasicaOutros: parseIntSafe(row["QT_BASICA_OUTROS"]),
                        qtBasicaLinhas: parseIntSafe(row["QT_BASICA_LINAS"]),
                        qtAvancadaDados: parseIntSafe(row["QT_AVANCADA_DADOS"]),
                        qtAvancadaVoz: parseIntSafe(row["AVANCADA_VOZ"]), // typo in request "AVANCADA_VOZ"
                        qtVivoTech: parseIntSafe(row["QT_VIVO_TECH"]),
                        qtOffice365: parseIntSafe(row["QT_OFFICE_365"]),
                        qtVvn: parseIntSafe(row["QT_VVN"]),

                        // Flags
                        flgCobertura: sanitize(row["FLG_COBERTURA"]),
                        dsDisponibilidade: sanitize(row["DS_DISPONIBILIDADE"]),
                        flgMei: sanitize(row["FLG_MEI"]),
                        flgNaoPerturbe: sanitize(row["FLG_NAO_PERTURBE"]),
                        flgCidDispVvn: sanitize(row["FLG_CID_DISP_VVN"]),
                        flgErb: sanitize(row["FLG_ERB"]),

                        // Marketing
                        trilha: sanitize(row["TRILHA"]),
                        primeiraOferta: sanitize(row["PRIMEIRA_OFERTA"]),
                        segundaOferta: sanitize(row["SEGUNDA_OFERTA"]),
                        terceiraOferta: sanitize(row["TERCEIRA_OFERTA"]),
                        acaoMkt1: sanitize(row["ACAO_MKT1"]),
                        acaoMkt2: sanitize(row["ACAO_MKT2"]),
                        acaoMkt3: sanitize(row["ACAO_MKT3"]),

                        lastImportId: batchId,
                        updatedAt: new Date(),
                    };

                    const existing = await prisma.intelligenceData.findUnique({
                        where: { cnpj }
                    });

                    if (existing) {
                        // Update
                        // Check history triggers
                        const historyEvents = [];

                        // 1. Consultant Change (Portability)
                        if (existing.loginConsultor !== newData.loginConsultor) {
                            historyEvents.push({
                                fieldChanged: "loginConsultor",
                                oldValue: existing.loginConsultor,
                                newValue: newData.loginConsultor
                            });
                        }
                        // 2. GN Change
                        if (existing.nomeGn !== newData.nomeGn) {
                            historyEvents.push({
                                fieldChanged: "nomeGn",
                                oldValue: existing.nomeGn,
                                newValue: newData.nomeGn
                            });
                        }
                        // 3. Vertical Change
                        if (existing.vertical !== newData.vertical) {
                            historyEvents.push({
                                fieldChanged: "vertical",
                                oldValue: existing.vertical,
                                newValue: newData.vertical
                            });
                        }
                        // 4. Office Change (derived)
                        if (existing.officeName !== newData.officeName && newData.officeName) {
                            historyEvents.push({
                                fieldChanged: "officeName",
                                oldValue: existing.officeName,
                                newValue: newData.officeName
                            });
                        }

                        // Save history
                        if (historyEvents.length > 0) {
                            await prisma.intelligenceHistory.createMany({
                                data: historyEvents.map(evt => ({
                                    intelligenceDataId: existing.id,
                                    cnpj,
                                    ...evt,
                                    importBatchId: batchId
                                }))
                            });
                            stats.historyCreated += historyEvents.length;
                        }

                        // Update Data
                        await prisma.intelligenceData.update({
                            where: { id: existing.id },
                            data: newData
                        });
                        stats.updated++;

                    } else {
                        // Create
                        await prisma.intelligenceData.create({
                            data: {
                                cnpj,
                                ...newData
                            }
                        });
                        stats.created++;
                    }

                } catch (err) {
                    console.error("Error processing row:", err);
                    stats.errors++;
                }
            }));
        }

        return NextResponse.json({
            success: true,
            stats,
            message: `Processed ${jsonData.length} rows. Created: ${stats.created}, Updated: ${stats.updated}, History Events: ${stats.historyCreated}`
        });

    } catch (error) {
        console.error("Error uploading intelligence data:", error);
        return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
    }
}
