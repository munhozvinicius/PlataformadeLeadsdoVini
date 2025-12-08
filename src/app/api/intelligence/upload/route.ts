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
        const allowedRoles = [Role.MASTER, Role.GERENTE_SENIOR, Role.GERENTE_NEGOCIOS];

        if (!session?.user || !allowedRoles.includes(session.user.role || "")) {
            return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        }

        const formData = await req.formData();
        const file = formData.get("file") as File;

        if (!file) {
            return NextResponse.json({ message: "File is required" }, { status: 400 });
        }

        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "buffer" });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const jsonData = XLSX.utils.sheet_to_json(worksheet) as Record<string, any>[];

        const batchId = new Date().toISOString(); // Simple batch ID for now
        const stats = {
            created: 0,
            updated: 0,
            historyCreated: 0,
            errors: 0
        };

        // Process in chunks or sequentially? Sequentially is safer for logic, but might be slow.
        // For V1, let's do sequential loop but optimize with transactions if needed.
        // Given complexity of "History", standard loop is best.

        for (const row of jsonData) {
            try {
                const cnpj = sanitize(row["NR_CNPJ"]);
                if (!cnpj) continue; // Skip lines without CNPJ

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
                    loginConsultor: sanitize(row["LOGINCONSULTOR"]), // CRITICAL for ownership
                    adabasMovel: sanitize(row["ADABASMOVEL"]),
                    adabasFixa: sanitize(row["ADABASFIXA"]),

                    // Office Name isn't explicit in column list provided, maybe derive from LOGINCONSULTOR or ADABAS?
                    // User said: "o gerente de negocios que ve os escritorios que ele cuida"
                    // Let's assume we map "NOMEGN" or look up loginConsultor later.
                    // For now, store what we have.

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
