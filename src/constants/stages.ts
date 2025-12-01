export type StageId =
  | "PROSPECCAO"
  | "QUALIFICACAO"
  | "REUNIAO"
  | "FECHAMENTO"
  | "GANHO"
  | "PERDIDO";

export const STAGES: { id: StageId; title: string }[] = [
  { id: "PROSPECCAO", title: "Prospecção" },
  { id: "QUALIFICACAO", title: "Qualificação" },
  { id: "REUNIAO", title: "Reunião" },
  { id: "FECHAMENTO", title: "Fechamento" },
  { id: "GANHO", title: "Ganho" },
  { id: "PERDIDO", title: "Perdido" },
];
