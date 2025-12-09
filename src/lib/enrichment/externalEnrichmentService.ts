import { Lead } from "@prisma/client";
import { fetchCompanyData } from "@/services/enrichment";

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

export async function fetchExternalEnrichmentForLead(lead: Lead): Promise<EnrichmentSuggestion[]> {
  const cnpj = lead.cnpj?.replace(/\D/g, "");

  if (!cnpj) {
    return [];
  }

  const suggestions: EnrichmentSuggestion[] = [];
  const makeId = (key: string) =>
    `${key}-${lead.id}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    const data = await fetchCompanyData(cnpj);

    if (!data) {
      return [];
    }

    // 1. Phone
    if (data.main_phone) {
      suggestions.push({
        id: makeId("phone_1"),
        type: "PHONE",
        label: "Telefone Principal",
        value: data.main_phone,
        source: "DigitalEnrichment",
      });
    }
    if (data.secondary_phone) {
      suggestions.push({
        id: makeId("phone_2"),
        type: "PHONE",
        label: "Telefone Secundário",
        value: data.secondary_phone,
        source: "DigitalEnrichment",
      });
    }

    // 2. Address
    if (data.logradouro) {
      suggestions.push({
        id: makeId("address"),
        type: "ADDRESS",
        label: "Endereço Fiscal",
        value: {
          logradouro: `${data.logradouro}, ${data.numero || "S/N"}`,
          bairro: "Não informado", // enrichment service might not return bairro for all providers
          cidade: data.municipio,
          estado: data.uf,
          cep: "Não informado", // enrichment service might not return cep for all providers
        },
        source: "DigitalEnrichment",
      });
    }

    // 3. CNAE / Activity
    if (data.cnae_fiscal_descricao) {
      suggestions.push({
        id: makeId("cnae"),
        type: "CNAE",
        label: "CNAE Principal",
        value: data.cnae_fiscal_descricao,
        source: "DigitalEnrichment",
      });
    }

    // 4. Partners (QSA)
    if (data.qsa && data.qsa.length > 0) {
      data.qsa.forEach((socio) => {
        suggestions.push({
          id: makeId(`partner_${socio.nome_socio.substring(0, 5)}`),
          type: "RESPONSIBLE",
          label: `Sócio: ${socio.qualificacao_socio}`,
          value: { nome: socio.nome_socio, cargo: socio.qualificacao_socio },
          source: "DigitalEnrichment",
        });
      });
    }
  } catch (error) {
    console.error("Error fetching enrichment data", error);
  }

  // Add Site Mock/Google prediction
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
