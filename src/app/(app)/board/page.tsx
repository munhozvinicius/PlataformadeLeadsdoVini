"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { LEAD_STATUS, LeadStatusId } from "@/constants/leadStatus";

type Lead = {
  id: string;
  razaoSocial?: string | null;
  nomeFantasia?: string | null;
  cidade?: string | null;
  endereco?: string | null;
  telefone?: string | null;
  telefone1?: string | null;
  telefone2?: string | null;
  telefone3?: string | null;
  cnpj?: string | null;
  vertical?: string | null;
  status: LeadStatusId;
  campanha?: { nome: string };
};

const PALITAGEM = [
  "Cliente não atende",
  "Telefone inválido",
  "Cliente recusou o contato",
  "Sem interesse no produto",
  "Em contrato com concorrente",
  "Empresa fechada",
  "Não é o decisor / Sem contato do decisor",
  "Prospecção incorreta (CNAE/Vertical errada)",
  "Lead duplicado",
  "Outro",
] as const;

export default function BoardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalLead, setModalLead] = useState<Lead | null>(null);
  const [motivo, setMotivo] = useState<string>("");
  const [obs, setObs] = useState("");
  const [savingPerdido, setSavingPerdido] = useState(false);

  const loadLeads = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/consultor/leads", { cache: "no-store" });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (!res.ok) {
        setError("Não foi possível carregar os leads.");
        return;
      }
      const data = await res.json();
      setLeads(data);
    } catch (err) {
      console.error(err);
      setError("Erro ao buscar leads.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated") {
      router.replace("/login");
      return;
    }
    if (status === "authenticated") {
      if (session?.user.role !== "CONSULTOR") {
        router.replace("/admin/campanhas");
        return;
      }
      loadLeads();
    }
  }, [status, session, router, loadLeads]);

  async function updateStatus(leadId: string, status: LeadStatusId) {
    if (status === "PERDIDO") {
      const lead = leads.find((l) => l.id === leadId) || null;
      setModalLead(lead);
      setMotivo("");
      setObs("");
      return;
    }
    await fetch(`/api/consultor/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await loadLeads();
  }

  const displayName = (lead: Lead) => lead.razaoSocial ?? lead.nomeFantasia ?? "Sem empresa";
  const gatherPhones = (lead: Lead) => {
    const values = [lead.telefone, lead.telefone1, lead.telefone2, lead.telefone3];
    const unique: string[] = [];
    for (const value of values) {
      if (value && !unique.includes(value)) {
        unique.push(value);
      }
    }
    return unique;
  };

  const grouped = useMemo(() => {
    const map: Record<LeadStatusId, Lead[]> = {
      NOVO: [],
      EM_CONTATO: [],
      EM_NEGOCIACAO: [],
      FECHADO: [],
      PERDIDO: [],
    };
    for (const lead of leads) {
      (map[lead.status] ?? []).push(lead);
    }
    return map;
  }, [leads]);

  async function confirmarPerdido() {
    if (!modalLead) return;
    if (!motivo) {
      setError("Selecione um motivo.");
      return;
    }
    if (motivo === "Outro" && !obs) {
      setError("Observação obrigatória para motivo Outro.");
      return;
    }
    setSavingPerdido(true);
    await fetch(`/api/leads/${modalLead.id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "PERDIDO", motivo, observacao: obs }),
    });
    setSavingPerdido(false);
    setModalLead(null);
    await loadLeads();
  }

  return (
    <div className="relative">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Consultor</p>
          <h1 className="text-2xl font-semibold">Meus Leads</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadLeads}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-100"
          >
            Atualizar
          </button>
        </div>
      </header>

      {error ? <div className="mb-4 text-red-600 text-sm">{error}</div> : null}
      {loading ? <div>Carregando...</div> : null}

      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4">
        {LEAD_STATUS.map((stage) => (
          <div
            key={stage.id}
            className="rounded-xl border border-slate-200 bg-white/80 backdrop-blur p-3 flex flex-col gap-3 min-h-[200px]"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700">{stage.title}</h2>
              <span className="text-xs text-slate-400">{grouped[stage.id]?.length ?? 0}</span>
            </div>
            <div className="flex flex-col gap-2">
            {(grouped[stage.id] || []).map((lead) => {
              const phones = gatherPhones(lead);
              return (
                <div
                  key={lead.id}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm"
                >
                  <p className="font-semibold text-sm">{displayName(lead)}</p>
                  <p className="text-[11px] text-slate-500">
                    {lead.vertical ?? "Vertical não informada"}
                  </p>
                  <p className="text-[11px] text-slate-400">{lead.cnpj ?? "-"}</p>
                  <p className="text-[11px] text-slate-400">{lead.cidade ?? "-"}</p>
                  {lead.endereco ? (
                    <p className="text-[11px] text-slate-400">{lead.endereco}</p>
                  ) : null}
                  <div className="mt-2 space-y-1 text-xs text-slate-500">
                    {phones.length > 0 ? (
                      phones.map((phone, index) => (
                        <p
                          key={`${phone}-${index}`}
                          className={index === 0 ? "text-xs text-slate-500" : "text-[11px] text-slate-400"}
                        >
                          {phone}
                        </p>
                      ))
                    ) : (
                      <p className="text-xs text-slate-500">Telefone não informado</p>
                    )}
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <select
                      value={lead.status}
                      onChange={(e) => updateStatus(lead.id, e.target.value as LeadStatusId)}
                      className="w-full border rounded-lg px-2 py-1 text-xs"
                    >
                      {LEAD_STATUS.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.title}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            })}
            </div>
          </div>
        ))}
      </div>
      {modalLead ? (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-30">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md space-y-4">
            <h3 className="text-lg font-semibold text-slate-900">Lead perdido</h3>
            <p className="text-sm text-slate-600">
              Preencha o motivo de perda para <strong>{modalLead.empresa}</strong>
            </p>
            <div className="space-y-2">
              <label className="text-xs text-slate-600">Motivo</label>
              <select
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Selecione</option>
                {PALITAGEM.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs text-slate-600">Observações complementares</label>
              <textarea
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
                rows={3}
                placeholder="Obrigatório se motivo = Outro"
              />
            </div>
            {error ? <div className="text-sm text-red-600">{error}</div> : null}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setModalLead(null)}
                className="px-4 py-2 text-sm rounded-lg border border-slate-200 hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarPerdido}
                disabled={savingPerdido}
                className="px-4 py-2 text-sm rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {savingPerdido ? "Salvando..." : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
