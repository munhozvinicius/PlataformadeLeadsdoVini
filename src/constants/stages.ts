export type StageId =
  | "NOVO"
  | "EM_CONTATO"
  | "EM_NEGOCIACAO"
  | "FECHADO"
  | "PERDIDO";

export const STAGES: { id: StageId; title: string }[] = [
  { id: "NOVO", title: "Novo" },
  { id: "EM_CONTATO", title: "Em contato" },
  { id: "EM_NEGOCIACAO", title: "Em negociação" },
  { id: "FECHADO", title: "Fechado" },
  { id: "PERDIDO", title: "Perdido" },
];
