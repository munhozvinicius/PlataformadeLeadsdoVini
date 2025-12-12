import React from "react";
import { CalendarClock, Clock3 } from "lucide-react";
import { LeadStatusId } from "@/constants/leadStatus";

export type LeadCardProps = {
  lead: {
    id: string;
    razaoSocial?: string | null;
    nomeFantasia?: string | null;
    cnpj?: string | null;
    campanha?: { nome?: string | null };
    vlFatPresumido?: string | null;
    status: LeadStatusId | string;
    externalData?: Record<string, unknown> | null;
    cidade?: string | null;
    estado?: string | null;
    telefone1?: string | null;
    telefone2?: string | null;
    telefone3?: string | null;
    lastActivityAt?: string | null;
    nextFollowUpAt?: string | null;
    nextStepNote?: string | null;
  };
  onOpen: (leadId: string) => void;
};

// Status label map removed as unused

export function LeadCard({ lead, onOpen }: LeadCardProps) {

  const nextFollowUpDate = lead.nextFollowUpAt ? new Date(lead.nextFollowUpAt) : null;
  const hasUpcoming = nextFollowUpDate ? nextFollowUpDate.getTime() >= Date.now() : false;
  const isMeeting = hasUpcoming && lead.nextStepNote === "REUNIAO";
  const isFollowUp = hasUpcoming && lead.nextStepNote === "FOLLOW_UP";
  const accentClass = isMeeting
    ? "border-l-neon-green ring-1 ring-neon-green/30 shadow-[0_0_16px_rgba(0,255,153,0.25)]"
    : isFollowUp
      ? "border-l-neon-blue ring-1 ring-neon-blue/30 shadow-[0_0_16px_rgba(0,243,255,0.25)]"
      : "border-pic-zinc hover:border-l-neon-pink hover:shadow-[0_0_20px_rgba(255,0,153,0.15)]";
  const accentPill = isMeeting ? { label: "Reunião", icon: <CalendarClock className="w-3 h-3" /> } : isFollowUp ? { label: "FUP", icon: <Clock3 className="w-3 h-3" /> } : null;
  const cornerColor = isMeeting ? "border-t-neon-green" : isFollowUp ? "border-t-neon-blue" : "border-t-pic-zinc";

  return (
    <div
      className={`group relative flex flex-col justify-between rounded-sm border-l-4 bg-pic-card p-4 transition-all cursor-pointer ${accentClass}`}
      onClick={() => onOpen(lead.id)}
    >
      <div className={`absolute right-0 top-0 h-0 w-0 border-t-[12px] border-r-[12px] ${cornerColor} border-r-transparent transition-colors group-hover:border-t-neon-pink`}></div>
      {accentPill && (
        <div className={`absolute -left-1 -top-1 flex items-center gap-1 rounded-br-md px-2 py-1 text-[10px] font-black uppercase tracking-wider ${isMeeting ? "bg-neon-green text-black" : "bg-neon-blue text-black"}`}>
          {accentPill.icon}
          {accentPill.label}
        </div>
      )}

      <div className="mb-4 flex items-start justify-between">
        <div className="space-y-1">
          {lead.status === 'NOVO' && (
            <div className="mb-2 inline-block border border-white px-1 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white">
              NEW
            </div>
          )}
          <h3 className="font-black text-lg uppercase tracking-tight text-white group-hover:text-neon-pink transition-colors line-clamp-2">
            {lead.nomeFantasia ?? lead.razaoSocial ?? "Sem empresa"}
          </h3>
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
            {lead.nomeFantasia ?? lead.razaoSocial ?? "AMARAL COMERCIO DE DOCES"}
          </p>
        </div>
        <div className="text-right">
          <span className="text-[10px] font-mono text-slate-500">
            {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
          </span>
        </div>
      </div>

      <div className="border-t border-dashed border-pic-zinc pt-3 mt-auto">
        <div className="flex items-end justify-between">
          <div>
            {/* Value Removed */}
          </div>
          <div className="flex flex-col items-end">
            {lead.campanha?.nome && (
              <span className="text-[10px] font-bold text-neon-green uppercase tracking-wider mb-1">
                {lead.campanha.nome}
              </span>
            )}
            <div className="flex items-center justify-center bg-neon-green text-black font-black text-xs h-6 w-6 rounded-sm">
              AM
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
