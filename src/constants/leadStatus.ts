export const LEAD_STATUS = [
  { id: "NOVO", title: "Novo" },
  { id: "EM_ATENDIMENTO", title: "Em atendimento" },
  { id: "FINALIZADO", title: "Finalizado" },
  { id: "PERDIDO", title: "Perdido" },
  { id: "REATRIBUIDO", title: "Reatribuído" },
] as const;

export type LeadStatusId = (typeof LEAD_STATUS)[number]["id"];
