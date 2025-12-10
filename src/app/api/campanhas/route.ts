export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma, LeadStatus, CampaignType } from "@prisma/client";
import * as XLSX from "xlsx";

function stringOrEmpty(value: unknown) {
    if (value === undefined || value === null) return "";
    return String(value).trim();
}

function normalizeKey(key: string) {
    return key
        .trim()
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

function normalizeRow(row: Record<string, unknown>): Record<string, string> {
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
        normalized[normalizeKey(key)] = stringOrEmpty(value);
    }
    return normalized;
}

function firstNonEmpty(...values: (string | undefined)[]) {
    return values.find((value) => value && value.length > 0) ?? "";
}

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ message: "Unauthorized (no session)" }, { status: 401, headers: { "x-debug": "no-session" } });
        }
        if (!session.user.role) {
            return NextResponse.json({ message: "Unauthorized (no role)" }, { status: 401, headers: { "x-debug": "no-role" } });
        }

        const formData = await req.formData();
        const nome = formData.get("nome") as string | null;
        const descricao = (formData.get("descricao") as string | null) ?? null;
        const gnId = (formData.get("gnId") as string | null) ?? null;
        const gsId = (formData.get("gsId") as string | null) ?? null;
        const ownerId = (formData.get("ownerId") as string | null) ?? null;
        const file = formData.get("file") as File | null;
        const tipoRaw = (formData.get("tipo") as string | null)?.trim().toUpperCase();
        const tipo = tipoRaw === "VISAO_PARQUE" ? CampaignType.VISAO_PARQUE : CampaignType.COCKPIT;

        if (!nome) {
            return NextResponse.json({ message: "Nome da campanha é obrigatório" }, { status: 400, headers: { "x-debug": "missing-nome" } });
        }

        // Prepare Campaign Data
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const campaignData: any = {
            nome: nome.trim(),
            descricao,
            createdById: session.user.id,
            assignedLeads: 0,
            remainingLeads: 0,
            totalLeads: 0,
            tipo,
        };

        if (gnId) campaignData.gnId = gnId;
        if (gsId) campaignData.gsId = gsId;
        if (ownerId) campaignData.ownerId = ownerId;

        // Check if Campaign exists (Case Insensitive)
        const officeIds = formData.getAll("officeIds") as string[];

        // Check if Campaign exists (Case Insensitive)
        const normalizedName = nome.trim();
        let campanha = await prisma.campanha.findFirst({
            where: {
                nome: { equals: normalizedName, mode: "insensitive" }
            }
        });

        if (!campanha) {
            campanha = await prisma.campanha.create({
                data: {
                    ...campaignData,
                    officeRecords: {
                        connect: officeIds.map(id => ({ id }))
                    }
                },
            });
        } else {
            // Update tipo and optionally connect offices
            await prisma.campanha.update({
                where: { id: campanha.id },
                data: {
                    tipo,
                    ...(officeIds.length > 0
                        ? {
                              officeRecords: {
                                  connect: officeIds.map(id => ({ id }))
                              }
                          }
                        : {}),
                }
            });
        }

        let importedCount = 0;

        if (file) {
            // Load Offices for Resolution
            const offices = await prisma.officeRecord.findMany({
                select: { id: true, office: true, code: true, name: true },
            });
            const officeLookup = new Map<string, string>();
            const normalizeOfficeKey = (value?: string) => (value ? value.trim().toUpperCase() : "");
            offices.forEach((office) => {
                const codeKey = normalizeOfficeKey(office.office ?? office.code);
                const nameKey = normalizeOfficeKey(office.name);
                if (codeKey) officeLookup.set(codeKey, office.id);
                if (nameKey) officeLookup.set(nameKey, office.id);
            });

            const resolveOfficeId = (territory?: string) => {
                const normalized = normalizeOfficeKey(territory);
                if (!normalized) return null;
                const direct = officeLookup.get(normalized);
                if (direct) return direct;
                for (const [key, id] of officeLookup.entries()) {
                    if (normalized.includes(key) || key.includes(normalized)) {
                        return id;
                    }
                }
                return null;
            };

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

            // Prepare Leads for Bulk Insert with Robust Logic
            const leadsToCreate = jsonData.map((row) => {
                const norm = normalizeRow(row);

                // Robust Field Extraction
                const razaoSocial = firstNonEmpty(norm["RAZAO_SOCIAL"], norm["EMPRESA"], norm["NOME_FANTASIA"], norm["NM_CLIENTE"]);
                const nomeFantasia = firstNonEmpty(norm["NOME_FANTASIA"], norm["EMPRESA"], norm["RAZAO_SOCIAL"], norm["NM_CLIENTE"]);
                const cidade = firstNonEmpty(norm["CIDADE"], norm["DS_CIDADE"]);
                const estado = firstNonEmpty(norm["ESTADO"], norm["UF"]);
                const telefone1 = firstNonEmpty(norm["TELEFONE1"], norm["TELEFONE"], norm["TLFN_1"]);
                const telefone2 = firstNonEmpty(norm["TELEFONE2"], norm["TLFN_2"]);
                const telefone3 = firstNonEmpty(norm["TELEFONE3"], norm["TLFN_3"]);
                const telefone = firstNonEmpty(telefone1, telefone2, telefone3);
                const cnpj = firstNonEmpty(norm["CNPJ"], norm["DOCUMENTO"], norm["NR_CNPJ"]);
                const email = firstNonEmpty(norm["EMAIL"], norm["EMAIL_CONTATO_PRINCIPAL_SFA"]);
                const enderecoBairro = norm["BAIRRO"];
                const vertical = norm["VERTICAL"];
                const logradouro = firstNonEmpty(norm["LOGRADOURO"], norm["DS_ENDERECO"]);
                const numero = norm["NUMERO"];
                const cep = firstNonEmpty(norm["CEP"], norm["NR_CEP"]);
                const endereco = logradouro ? `${logradouro}${numero ? `, ${numero}` : ""}` : "";
                const territoire = norm["TERRITORIO"];
                const ofertaMkt = firstNonEmpty(norm["OFERTA MKT"], norm["OFERTA_MKT"], norm["OFERTA"]);
                const estrategia = norm["ESTRATEGIA"];
                const armario = norm["ARMARIO"];
                const idPruma = norm["ID PRUMA"];
                const vlFatPresumido = firstNonEmpty(norm["VL_FAT_PRESUMIDO"], norm["VL FAT PRESUMIDO"]);
                const cnae = firstNonEmpty(norm["CD_CNAE"], norm["CNAE"]);
                const origem = norm["ORIGEM"] || nome.trim() || "Importação";
                const telefones = [
                    telefone1 ? { rotulo: "Telefone 1", valor: telefone1 } : null,
                    telefone2 ? { rotulo: "Telefone 2", valor: telefone2 } : null,
                    telefone3 ? { rotulo: "Telefone 3", valor: telefone3 } : null,
                ].filter(Boolean);
                const site = norm["SITE"];

                // Mapa Parque Logic
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const externalData: Record<string, any> = {};
                if (Object.keys(norm).some(k => k.includes("QT_MOVEL") || k.includes("MAPA_PARQUE"))) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const parseIntSafe = (v: any) => {
                        const clean = String(v || "").replace(/\D/g, "");
                        return parseInt(clean, 10) || 0;
                    };

                    externalData.mapaParque = {
                        qtMovelTerm: parseIntSafe(norm["QT_MOVEL_TERM"]),
                        qtMovelPen: parseIntSafe(norm["QT_MOVEL_PEN"]),
                        qtMovelM2m: parseIntSafe(norm["QT_MOVEL_M2M"]),
                        qtBasicaFibra: parseIntSafe(norm["QT_BASICA_TERM_FIBRA"]),
                        qtBasicaMetalico: parseIntSafe(norm["QT_BASICA_TERM_METALICO"]),
                        qtBasicaBl: parseIntSafe(norm["QT_BASICA_BL"]),
                        qtBlFtth: parseIntSafe(norm["QT_BL_FTTH"]),
                        qtBlFttc: parseIntSafe(norm["QT_BL_FTTC"]),
                        qtBasicaTv: parseIntSafe(norm["QT_BASICA_TV"]),
                        qtBasicaOutros: parseIntSafe(norm["QT_BASICA_OUTROS"]),
                        qtBasicaLinhas: parseIntSafe(norm["QT_BASICA_LINAS"]),
                        qtAvancadaDados: parseIntSafe(norm["QT_AVANCADA_DADOS"]),
                        avancadaVoz: parseIntSafe(norm["AVANCADA_VOZ"]),
                        qtVivoTech: parseIntSafe(norm["QT_VIVO_TECH"]),
                        qtVvn: parseIntSafe(norm["QT_VVN"]),
                        dataFimVtech: norm["DATA_FIM_VTECH"],
                        flgTrocaVtech: norm["FLG_TROCA_VTECH"],
                        flgPqDigital: norm["FLG_PQ_DIGITAL"],
                        flgCliBiometrado: norm["FLG_CLI_BIOMETRADO"],
                        qtdSfaFiliais: parseIntSafe(norm["QTD_SFA_FILIAIS"]),
                        tpProduto: norm["TP_PRODUTO"],
                        nomerede: norm["NOMEREDE"],
                        nmContatoSfa: norm["NM_CONTATO_SFA"],
                        emailContatoSfa: norm["EMAIL_CONTATO_PRINCIPAL_SFA"],
                        celularContatoSfa: norm["CELULAR_CONTATO_PRINCIPAL_SFA"],
                        telComercialSiebel: norm["TEL_COMERCIAL_SIEBEL"],
                        telCelularSiebel: norm["TEL_CELULAR_SIEBEL"],
                        telResidencialSiebel: norm["TEL_RESIDENCIAL_SIEBEL"],
                    };
                }


                return {
                    campanhaId: campanha.id,
                    importBatchId: batch.id,
                    razaoSocial,
                    nomeFantasia,
                    vertical,
                    cidade,
                    estado,
                    telefone,
                    telefone1: telefone1 || undefined,
                    telefone2: telefone2 || undefined,
                    telefone3: telefone3 || undefined,
                    cnpj,
                    documento: cnpj || undefined,
                    email,
                    logradouro: logradouro || undefined,
                    numero: numero || undefined,
                    bairro: enderecoBairro || undefined,
                    cep: cep || undefined,
                    endereco: endereco || undefined,
                    territorio: territoire || undefined,
                    ofertaMkt: ofertaMkt || undefined,
                    estrategia: estrategia || undefined,
                    armario: armario || undefined,
                    idPruma: idPruma || undefined,
                    vlFatPresumido: vlFatPresumido || undefined,
                    cnae: cnae || undefined,
                    raw: norm as Prisma.InputJsonValue,
                    externalData: Object.keys(externalData).length > 0 ? externalData : (norm as Prisma.InputJsonValue),
                    consultorId: null, // Initial import implies unassigned stock
                    status: LeadStatus.NOVO,
                    historico: [],
                    isWorked: false,
                    telefones,
                    emails: email ? [email] : [],
                    origem: origem,
                    site: site || undefined,
                    officeId: resolveOfficeId(territoire) ?? undefined,
                };
            });

            if (leadsToCreate.length > 0) {
                // Using createMany for performance.
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
