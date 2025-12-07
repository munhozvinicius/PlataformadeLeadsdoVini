export type EnrichedCompanyData = {
    razao_social?: string;
    nome_fantasia?: string;
    cnpj?: string;
    cnae_fiscal_descricao?: string;
    capital_social?: number;
    qsa?: Array<{ nome_socio: string; qualificacao_socio: string }>;
    logradouro?: string;
    numero?: string;
    municipio?: string;
    uf?: string;
    porte?: string;
    main_phone?: string;
    secondary_phone?: string;
    // Employee count estimation (often not directly available publicly but Porte can be a proxy)
    employee_count_estimate?: string;
};

// Normalizes data from different providers to our schema
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeData(data: any, provider: "minhareceita" | "brasilapi" | "receitaws"): EnrichedCompanyData {
    switch (provider) {
        case "minhareceita":
            return {
                razao_social: data.razao_social,
                nome_fantasia: data.nome_fantasia,
                cnpj: data.cnpj,
                cnae_fiscal_descricao: data.cnae_fiscal_descricao,
                capital_social: typeof data.capital_social === 'string' ? parseFloat(data.capital_social) : data.capital_social,
                qsa: data.qsa?.map((q: { nome_socio: string; qualificacao_socio: string }) => ({
                    nome_socio: q.nome_socio,
                    qualificacao_socio: q.qualificacao_socio
                })),
                logradouro: data.descricao_tipo_de_logradouro ? `${data.descricao_tipo_de_logradouro} ${data.logradouro}` : data.logradouro,
                numero: data.numero,
                municipio: data.municipio,
                uf: data.uf,
                porte: data.porte,
                main_phone: data.ddd_telefone_1,
                secondary_phone: data.ddd_telefone_2,
            };
        case "brasilapi":
            return {
                razao_social: data.razao_social,
                nome_fantasia: data.nome_fantasia,
                cnpj: data.cnpj,
                cnae_fiscal_descricao: data.cnae_fiscal_descricao,
                capital_social: data.capital_social,
                qsa: data.qsa?.map((q: { nome_socio: string; qualificacao_socio: string }) => ({
                    nome_socio: q.nome_socio,
                    qualificacao_socio: q.qualificacao_socio
                })),
                logradouro: data.logradouro,
                numero: data.numero,
                municipio: data.municipio,
                uf: data.uf,
                porte: data.descricao_porte ?? data.porte, // BrasilAPI often returns 'descricao_porte' or just matches standard
                main_phone: data.ddd_telefone_1,
                secondary_phone: data.ddd_telefone_2,
                // BrasilAPI doesn't typically provide employee count, we can maybe infer from porte later or stick to null
            };
        case "receitaws":
            return {
                razao_social: data.nome,
                nome_fantasia: data.fantasia,
                cnpj: data.cnpj?.replace(/\D/g, ""),
                cnae_fiscal_descricao: data.atividade_principal?.[0]?.text,
                capital_social: typeof data.capital_social === 'string' ? parseFloat(data.capital_social) : data.capital_social,
                qsa: data.qsa?.map((q: { nome: string; qual: string }) => ({
                    nome_socio: q.nome,
                    qualificacao_socio: q.qual
                })),
                logradouro: data.logradouro,
                numero: data.numero,
                municipio: data.municipio,
                uf: data.uf,
                porte: data.porte,
                main_phone: data.telefone, // ReceitaWS usually returns a single 'telefone' string
            };
        default:
            return {};
    }
}

export async function fetchCompanyData(cnpj: string): Promise<EnrichedCompanyData | null> {
    const cleanCnpj = cnpj.replace(/\D/g, "");

    // 1. Try BrasilAPI (Most reliable for QSA and Basic Data currently)
    try {
        const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`);
        if (res.ok) {
            const data = await res.json();
            return normalizeData(data, "brasilapi");
        }
    } catch (e) {
        console.warn("BrasilAPI failed", e);
    }

    // 2. Try MinhaReceita (Fallback)
    try {
        const resGet = await fetch(`https://minhareceita.org/${cleanCnpj}`);
        if (resGet.ok) {
            const data = await resGet.json();
            return normalizeData(data, "minhareceita");
        }
    } catch (e) {
        console.warn("MinhaReceita failed", e);
    }

    // 3. Try ReceitaWS (Fallback)
    try {
        const res = await fetch(`https://www.receitaws.com.br/v1/cnpj/${cleanCnpj}`);
        if (res.ok) {
            const data = await res.json();
            // ReceitaWS free tier might return 200 OK but with status "ERROR" in body
            if (data.status === "ERROR") throw new Error(data.message);
            return normalizeData(data, "receitaws");
        }
    } catch (e) {
        console.warn("ReceitaWS failed", e);
    }

    return null;
}
