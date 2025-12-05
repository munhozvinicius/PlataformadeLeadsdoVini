import { Lead } from "@prisma/client";

export type EnrichmentSuggestion = {
  type: "PHONE" | "ADDRESS" | "SITE" | "NAME" | "OTHER";
  value: string;
  source: string;
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
  if (lead.cnpj) {
    suggestions.push({
      type: "PHONE",
      value: "11955550000",
      source: "mock-maps",
    });
  }
  if (lead.cidade && lead.estado) {
    suggestions.push({
      type: "ADDRESS",
      value: `${lead.cidade} - ${lead.estado}`,
      source: "mock-maps",
    });
  }
  if (lead.razaoSocial) {
    suggestions.push({
      type: "SITE",
      value: `https://${lead.razaoSocial.toLowerCase().replace(/\s+/g, "")}.com.br`,
      source: "mock-search",
    });
  }
  return suggestions;
}

