export type EnrichedCompanyData = {
    razao_social?: string;
    nome_fantasia?: string;
    cnpj?: string;
    cnae_fiscal_descricao?: string;
    capital_social?: number;
    qsa?: Array<{ nome: string; qual: string }>;
    logradouro?: string;
    numero?: string;
    municipio?: string;
    uf?: string;
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
                capital_social: data.capital_social, // Might need parsing if string
                qsa: data.qsa?.map((q: { nome_socio: string; qualificacao_socio: string }) => ({
                    nome: q.nome_socio,
                    qual: q.qualificacao_socio
                })),
                logradouro: data.descricao_tipo_de_logradouro ? `${data.descricao_tipo_de_logradouro} ${data.logradouro}` : data.logradouro,
                numero: data.numero,
                municipio: data.municipio,
                uf: data.uf
            };
        case "brasilapi":
            return {
                razao_social: data.razao_social,
                nome_fantasia: data.nome_fantasia,
                cnpj: data.cnpj,
                cnae_fiscal_descricao: data.cnae_fiscal_descricao,
                capital_social: data.capital_social,
                qsa: data.qsa?.map((q: { nome_socio: string; qualificacao_socio: string }) => ({
                    nome: q.nome_socio,
                    qual: q.qualificacao_socio // BrasilAPI returns this field directly usually
                }))
            };
        case "receitaws":
            return {
                razao_social: data.nome,
                nome_fantasia: data.fantasia,
                cnpj: data.cnpj?.replace(/\D/g, ""),
                cnae_fiscal_descricao: data.atividade_principal?.[0]?.text,
                capital_social: parseFloat(data.capital_social),
                qsa: data.qsa?.map((q: { nome: string; qual: string }) => ({
                    nome: q.nome,
                    qual: q.qual
                })),
                logradouro: data.logradouro,
                numero: data.numero,
                municipio: data.municipio,
                uf: data.uf
            };
        default:
            return {};
    }
}

export async function fetchCompanyData(cnpj: string): Promise<EnrichedCompanyData | null> {
    const cleanCnpj = cnpj.replace(/\D/g, "");

    // 1. Try MinhaReceita (Very stable, open source database)
    try {
        // MinhaReceita often prefers POST or direct GET
        // Actually minhareceita.org public API is GET usually but let's try standard fetch
        const resGet = await fetch(`https://minhareceita.org/${cleanCnpj}`);
        if (resGet.ok) {
            const data = await resGet.json();
            return normalizeData(data, "minhareceita");
        }
    } catch (e) {
        console.warn("MinhaReceita failed", e);
    }

    // 2. Try BrasilAPI (Good but rate limited sometimes)
    try {
        const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`);
        if (res.ok) {
            const data = await res.json();
            return normalizeData(data, "brasilapi");
        }
    } catch (e) {
        console.warn("BrasilAPI failed", e);
    }

    // 3. Try ReceitaWS (Free tier limits to 3 requests/min, good fallback)
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
