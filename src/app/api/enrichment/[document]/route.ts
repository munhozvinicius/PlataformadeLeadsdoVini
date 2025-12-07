import { NextRequest, NextResponse } from "next/server";

type EnrichmentSuggestionType =
  | "PHONE"
  | "EMAIL"
  | "ADDRESS"
  | "CNAE"
  | "PORTE"
  | "RESPONSIBLE"
  | "SITE";

type EnrichmentSuggestion = {
  id: string;
  type: EnrichmentSuggestionType;
  field: string;
  label: string;
  value: unknown;
  source: string;
};

type Params = { params: { document: string } };

async function fetchWithTimeout(url: string, timeoutMs = 5000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(_req: NextRequest, { params }: Params) {
  const doc = (params.document || "").replace(/\D+/g, "");
  if (!doc) {
    return NextResponse.json({ success: false, message: "Documento inválido" }, { status: 400 });
  }

  const suggestions: EnrichmentSuggestion[] = [];
  const raw: Record<string, unknown> = {};

  // 1) Cadastro básico via BrasilAPI (ou equivalente)
  try {
    console.log("[ENRICHMENT_REQUEST]", { doc, source: "BrasilAPI" });
    const res = await fetchWithTimeout(`https://brasilapi.com.br/api/cnpj/v1/${doc}`, 5000);
    if (res.ok) {
      const data = await res.json();
      raw.brasilapi = data;
      if (data?.telefone) {
        suggestions.push({
          id: `phone-${doc}`,
          type: "PHONE",
          field: "phones",
          label: "Telefone sugerido",
          value: String(data.telefone),
          source: "BrasilAPI",
        });
      }
      if (data?.email) {
        suggestions.push({
          id: `email-${doc}`,
          type: "EMAIL",
          field: "email",
          label: "Email sugerido",
          value: String(data.email),
          source: "BrasilAPI",
        });
      }
      if (data?.nome_fantasia) {
        suggestions.push({
          id: `resp-${doc}`,
          type: "RESPONSIBLE",
          field: "responsible",
          label: "Responsável (fantasia)",
          value: { nome: data.nome_fantasia },
          source: "BrasilAPI",
        });
      }
      if (data?.cnae_fiscal_descricao || data?.cnae_fiscal) {
        suggestions.push({
          id: `cnae-${doc}`,
          type: "CNAE",
          field: "cnae",
          label: "CNAE oficial",
          value: { cnae: data.cnae_fiscal, descricao: data.cnae_fiscal_descricao },
          source: "BrasilAPI",
        });
      }
      if (data?.porte) {
        suggestions.push({
          id: `porte-${doc}`,
          type: "PORTE",
          field: "porte",
          label: "Porte (Receita)",
          value: data.porte,
          source: "BrasilAPI",
        });
      }
      if (data?.logradouro || data?.uf || data?.municipio) {
        suggestions.push({
          id: `address-${doc}`,
          type: "ADDRESS",
          field: "address",
          label: "Endereço Receita",
          value: {
            logradouro: data.logradouro,
            numero: data.numero,
            bairro: data.bairro,
            cidade: data.municipio,
            estado: data.uf,
            cep: data.cep,
          },
          source: "BrasilAPI",
        });
      }
    } else {
      raw.brasilapi_error = await res.text();
    }
  } catch (err) {
    console.error("[ENRICHMENT_ERROR][BrasilAPI]", err);
  }

  // 2) ReceitaWS (fallback apenas se não houver nada ainda)
  if (suggestions.length === 0) {
    try {
      console.log("[ENRICHMENT_REQUEST]", { doc, source: "ReceitaWS" });
      const res = await fetchWithTimeout(`https://receitaws.com.br/v1/cnpj/${doc}`, 5000);
      if (res.ok) {
        const data = await res.json();
        raw.receitaws = data;
        if (data?.telefone) {
          suggestions.push({
            id: `phone-rws-${doc}`,
            type: "PHONE",
            field: "phones",
            label: "Telefone sugerido",
            value: String(data.telefone),
            source: "ReceitaWS",
          });
        }
        if (data?.email) {
          suggestions.push({
            id: `email-rws-${doc}`,
            type: "EMAIL",
            field: "email",
            label: "Email sugerido",
            value: String(data.email),
            source: "ReceitaWS",
          });
        }
        if (data?.atividade_principal?.length) {
          const principal = data.atividade_principal[0];
          suggestions.push({
            id: `cnae-rws-${doc}`,
            type: "CNAE",
            field: "cnae",
            label: "CNAE oficial",
            value: { cnae: principal.code, descricao: principal.text },
            source: "ReceitaWS",
          });
        }
        if (data?.porte) {
          suggestions.push({
            id: `porte-rws-${doc}`,
            type: "PORTE",
            field: "porte",
            label: "Porte (Receita)",
            value: data.porte,
            source: "ReceitaWS",
          });
        }
        if (data?.logradouro || data?.uf || data?.municipio) {
          suggestions.push({
            id: `address-rws-${doc}`,
            type: "ADDRESS",
            field: "address",
            label: "Endereço Receita",
            value: {
              logradouro: data.logradouro,
              numero: data.numero,
              bairro: data.bairro,
              cidade: data.municipio,
              estado: data.uf,
              cep: data.cep,
            },
            source: "ReceitaWS",
          });
        }
      } else {
        raw.receitaws_error = await res.text();
      }
    } catch (err) {
      console.error("[ENRICHMENT_ERROR][ReceitaWS]", err);
    }
  }

  console.log("[ENRICHMENT_RESPONSE]", { doc, suggestionsCount: suggestions.length });

  if (suggestions.length === 0) {
    return NextResponse.json({
      success: true,
      suggestions: [],
      errorMessage: "Não foi possível enriquecer este CNPJ agora.",
      raw,
    });
  }

  return NextResponse.json({ success: true, suggestions, raw });
}
