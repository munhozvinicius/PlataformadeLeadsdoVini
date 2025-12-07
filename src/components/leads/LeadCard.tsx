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
      className="rounded-none border-2 border-pic-zinc bg-pic-card px-4 py-4 shadow-none hover:border-neon-pink hover:shadow-[4px_4px_0px_0px_rgba(255,0,153,0.5)] transition-all cursor-pointer group"
      onClick={() => onOpen(lead.id)}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-sm font-bold text-white uppercase tracking-wide group-hover:text-neon-pink transition-colors">
            {lead.nomeFantasia ?? lead.razaoSocial ?? "Sem empresa"}
          </p>
          <p className="text-xs text-slate-400 font-mono mt-1">{lead.cnpj ?? "CNPJ não informado"}</p>
        </div>
        <span className="rounded-none border border-neon-green bg-pic-zinc/50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-neon-green">
          {statusLabel[lead.status]}
        </span>
      </div>
      <div className="mt-2 text-xs text-slate-400 space-y-2 font-mono">
        <p className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 bg-slate-600 rounded-full"></span>
          {lead.cidade ?? "-"} {lead.estado ? `/ ${lead.estado}` : ""}
        </p>
        <p className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 bg-slate-600 rounded-full"></span>
          {phone}
        </p>
        {lead.campanha?.nome ? (
          <div className="pt-1">
            <span className="inline-block border border-pic-zinc bg-pic-dark px-2 py-1 text-[10px] text-slate-300 uppercase truncate max-w-full">
              {lead.campanha.nome}
            </span>
          </div>
        ) : null}
        {lead.lastActivityAt ? (
          <p className="text-[10px] text-slate-500 pt-2 border-t border-dashed border-pic-zinc">
            Última ativ.: {new Date(lead.lastActivityAt).toLocaleString("pt-BR")}
          </p>
        ) : null}
      </div>
    </div>
  );
}
