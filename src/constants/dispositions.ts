export type DispositionCode =
  | "SEM_CONTATO"
  | "NUMERO_INVALIDO"
  | "FALOU_SECRETARIA"
  | "CLIENTE_SEM_INTERESSE"
  | "SEM_ORCAMENTO"
  | "SEM_PERFIL"
  | "JA_ATENDE_OUTRO_FORNECEDOR"
  | "FECHOU_COM_CONCORRENTE"
  | "VAI_AVALIAR_RETORNAR"
  | "OUTRO";

export const DISPOSITIONS: { code: DispositionCode; label: string }[] = [
  { code: "SEM_CONTATO", label: "Não conseguiu contato" },
  { code: "NUMERO_INVALIDO", label: "Número inválido / errado" },
  { code: "FALOU_SECRETARIA", label: "Falou com secretária / terceiro" },
  { code: "CLIENTE_SEM_INTERESSE", label: "Cliente sem interesse" },
  { code: "SEM_ORCAMENTO", label: "Sem orçamento no momento" },
  { code: "SEM_PERFIL", label: "Cliente sem perfil para solução" },
  { code: "JA_ATENDE_OUTRO_FORNECEDOR", label: "Já atende com outro fornecedor" },
  { code: "FECHOU_COM_CONCORRENTE", label: "Fechou com concorrente" },
  { code: "VAI_AVALIAR_RETORNAR", label: "Vai avaliar e retornar" },
  { code: "OUTRO", label: "Outro (descrever na observação)" },
];
