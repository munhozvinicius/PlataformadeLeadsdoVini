import { Lead } from "@prisma/client";

export type EnrichmentSuggestionType =
  | "PHONE"
  | "EMAIL"
  | "ADDRESS"
  | "CNAE"
  | "PORTE"
  | "RESPONSIBLE"
  | "SITE"
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

const ENRICHMENT_MOCK_ENABLED = true;

export async function fetchExternalEnrichmentForLead(lead: Lead): Promise<EnrichmentSuggestion[]> {
  // Guard for real API config
  if (!process.env.ENRICHMENT_API_URL_1 || !process.env.ENRICHMENT_API_KEY_1) {
    if (!ENRICHMENT_MOCK_ENABLED) {
      const err = new Error("ENRICHMENT_NOT_CONFIGURED");
      // @ts-expect-error custom flag
      err.code = "ENRICHMENT_NOT_CONFIGURED";
      throw err;
    }
  }

  // Stub/mock suggestions. This can be swapped for real fetch calls.
  const suggestions: EnrichmentSuggestion[] = [];
  const makeId = (key: string) =>
    `${key}-${lead.id}-${Math.random().toString(36).slice(2, 8)}`;

  if (lead.cnpj) {
    suggestions.push({
      id: makeId("phone"),
      type: "PHONE",
      label: "Telefone sugerido",
      value: "11955550000",
      source: "RECEITA_MOCK",
    });
  }
  if (lead.cidade && lead.estado) {
    suggestions.push({
      id: makeId("address"),
      type: "ADDRESS",
      label: "Endereço oficial",
      value: {
        logradouro: "Rua Exemplo 123",
        cidade: lead.cidade,
        estado: lead.estado,
        cep: "00000-000",
      },
      source: "RECEITA_MOCK",
    });
  }
  if (lead.razaoSocial) {
    suggestions.push({
      id: makeId("site"),
      type: "SITE",
      label: "Site sugerido",
      value: `https://${lead.razaoSocial.toLowerCase().replace(/\s+/g, "")}.com.br`,
      source: "SEARCH_MOCK",
    });
    suggestions.push({
      id: makeId("cnae"),
      type: "CNAE",
      label: "CNAE oficial",
      value: { cnae: "23.14-7/00", descricao: "Fabricação de estruturas metálicas" },
      source: "RECEITA_MOCK",
    });
    suggestions.push({
      id: makeId("porte"),
      type: "PORTE",
      label: "Porte estimado",
      value: "Pequena empresa (20–99 funcionários)",
      source: "RECEITA_MOCK",
    });
    suggestions.push({
      id: makeId("responsible"),
      type: "RESPONSIBLE",
      label: "Responsável / Sócio",
      value: { nome: "José da Silva", cargo: "Sócio" },
      source: "RECEITA_MOCK",
    });
  }
  return suggestions;
}
