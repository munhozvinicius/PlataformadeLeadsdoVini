import React from "react";
import { LeadStatusId } from "@/constants/leadStatus";

export type LeadCardProps = {
  lead: {
    id: string;
    razaoSocial?: string | null;
    nomeFantasia?: string | null;
    cnpj?: string | null;
    campanha?: { nome?: string | null };
    status: LeadStatusId;
    cidade?: string | null;
    estado?: string | null;
    telefone1?: string | null;
    telefone2?: string | null;
    telefone3?: string | null;
    lastActivityAt?: string | null;
  };
  onOpen: (leadId: string) => void;
};

const statusLabel: Record<LeadStatusId, string> = {
  NOVO: "Novo",
  EM_CONTATO: "Em contato",
  EM_NEGOCIACAO: "Em negociação",
  FECHADO: "Fechado",
  PERDIDO: "Perdido",
};

export function LeadCard({ lead, onOpen }: LeadCardProps) {
  const phone = lead.telefone1 || lead.telefone2 || lead.telefone3 || "Telefone não informado";
  return (
    <div
      className="rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm hover:shadow-md transition cursor-pointer"
      onClick={() => onOpen(lead.id)}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-900">
            {lead.nomeFantasia ?? lead.razaoSocial ?? "Sem empresa"}
          </p>
          <p className="text-xs text-slate-500">{lead.cnpj ?? "CNPJ não informado"}</p>
        </div>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">
          {statusLabel[lead.status]}
        </span>
      </div>
      <div className="mt-2 text-xs text-slate-600 space-y-1">
        <p>
          {lead.cidade ?? "-"} {lead.estado ? `/ ${lead.estado}` : ""}
        </p>
        <p>{phone}</p>
        {lead.campanha?.nome ? (
          <span className="inline-flex rounded-full bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600">
            {lead.campanha.nome}
          </span>
        ) : null}
        {lead.lastActivityAt ? (
          <p className="text-[11px] text-slate-500">
            Última atividade: {new Date(lead.lastActivityAt).toLocaleString("pt-BR")}
          </p>
        ) : null}
      </div>
    </div>
  );
}
