import { Lead } from "@prisma/client";

export type EnrichmentSuggestionType =
  | "PHONE"
  | "EMAIL"
  | "ADDRESS"
  | "CNAE"
  | "PORTE"
  | "RESPONSIBLE"
  | "SITE"
  | "EMPLOYEES"
  | "OTHER";

export type EnrichmentSuggestion = {
  id: string;
  type: EnrichmentSuggestionType;
  label: string;
  value: unknown;
  source: string;
  applied?: boolean;
  ignored?: boolean;
};

type BrasilApiCompany = {
  cnpj: string;
  razao_social: string;
  nome_fantasia: string;
  cnae_fiscal_descricao: string;
  descricao_situacao_cadastral: string;
  capital_social: number;
  unidade_federativa: string;
  municipio: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cep: string;
  ddd_telefone_1?: string;
  ddd_telefone_2?: string;
  qsa?: Array<{
    nome_socio: string;
    qualificacao_socio: string;
    faixa_etaria?: string;
  }>;
};

export async function fetchExternalEnrichmentForLead(lead: Lead): Promise<EnrichmentSuggestion[]> {
  const cnpj = lead.cnpj?.replace(/\D/g, "");

  if (!cnpj) {
    return [];
  }

  const suggestions: EnrichmentSuggestion[] = [];
  const makeId = (key: string) =>
    `${key}-${lead.id}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);

    if (!response.ok) {
      console.error("BrasilAPI Error:", response.status, response.statusText);
      return [];
    }

    const data = (await response.json()) as BrasilApiCompany;

    // 1. Phone
    if (data.ddd_telefone_1) {
      suggestions.push({
        id: makeId("phone_1"),
        type: "PHONE",
        label: "Telefone Principal (Receita)",
        value: data.ddd_telefone_1,
        source: "BrasilAPI",
      });
    }
    if (data.ddd_telefone_2) {
      suggestions.push({
        id: makeId("phone_2"),
        type: "PHONE",
        label: "Telefone Secundário (Receita)",
        value: data.ddd_telefone_2,
        source: "BrasilAPI",
      });
    }

    // 2. Address
    if (data.logradouro) {
      suggestions.push({
        id: makeId("address"),
        type: "ADDRESS",
        label: "Endereço Receita",
        value: {
          logradouro: `${data.logradouro}, ${data.numero} ${data.complemento || ""}`,
          bairro: data.bairro,
          cidade: data.municipio,
          estado: data.unidade_federativa,
          cep: data.cep,
        },
        source: "BrasilAPI",
      });
    }

    // 3. CNAE / Activity
    if (data.cnae_fiscal_descricao) {
      suggestions.push({
        id: makeId("cnae"),
        type: "CNAE",
        label: "CNAE Principal",
        value: data.cnae_fiscal_descricao,
        source: "BrasilAPI",
      });
    }

    // 4. Partners (QSA)
    if (data.qsa && data.qsa.length > 0) {
      // We store the full QSA array as a JSON value or individual items? 
      // The current UI expects `qsa` array in the `externalData` blob, but here we are generating suggestions.
      // However, the `enrich` route route ALSO returns the raw data as part of `externalData` in the LeadDetailModal logic
      // if we look at `LeadDetailModal.tsx` -> `runEnrichment` -> `api/leads/enrich`.
      // The route `api/leads/[id]/enrich/route.ts` calls THIS function to get suggestions, 
      // BUT `LeadDetailModal` expects `externalData` to be popuplated with the raw JSON for the `CompanyEnrichmentCard`.
      // We should arguably return the RAW data too, but this function signature returns proper specific suggestions.
      // 
      // Wait, `LeadDetailModal` DOES NOT use these suggestions for the `CompanyEnrichmentCard`. 
      // It passes `externalData` to the card. 
      // The ROUTE needs to return the RAW payload for the card to work.

      // Let's add individual Responsible suggestions for the "Add Contact" feature
      data.qsa.forEach((socio) => {
        suggestions.push({
          id: makeId(`partner_${socio.nome_socio.substring(0, 5)}`),
          type: "RESPONSIBLE",
          label: `Sócio: ${socio.qualificacao_socio}`,
          value: { nome: socio.nome_socio, cargo: socio.qualificacao_socio },
          source: "BrasilAPI",
        });
      });
    }

  } catch (error) {
    console.error("Error fetching functionality from BrasilAPI", error);
    // Silent fail or throw? Silent is better for enrichment.
  }

  // Add Site Mock/Google prediction if needed, or remove if we want strict accuracy. 
  // User asked for "Google Search", so maybe we don't guess the website URL anymore 
  // unless we have a Custom Search API.
  if (lead.razaoSocial) {
    suggestions.push({
      id: makeId("site_search"),
      type: "SITE",
      label: "Busca Google",
      value: `https://www.google.com/search?q=${encodeURIComponent(lead.razaoSocial)}`,
      source: "Generated",
    });
  }

  return suggestions;
}
