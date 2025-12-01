export const LEAD_STATUS = [
  { id: "NOVO", title: "Novo" },
  { id: "EM_CONTATO", title: "Em contato" },
  { id: "EM_NEGOCIACAO", title: "Em negociação" },
  { id: "FECHADO", title: "Fechado" },
  { id: "PERDIDO", title: "Perdido" },
] as const;

export type LeadStatusId = (typeof LEAD_STATUS)[number]["id"];
