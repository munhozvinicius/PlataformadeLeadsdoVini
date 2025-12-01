"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { LEAD_STATUS, LeadStatusId } from "@/constants/leadStatus";

type Lead = {
  id: string;
  empresa?: string | null;
  cidade?: string | null;
  telefone?: string | null;
  cnpj?: string | null;
  status: LeadStatusId;
  campanha?: { nome: string };
};

export default function BoardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status === "authenticated" && session?.user.role !== "CONSULTOR") {
      // direciona master/owner para admin
      router.replace("/admin/campanhas");
    }
  }, [status, session, router]);

  useEffect(() => {
    loadLeads();
  }, []);

  async function loadLeads() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/consultor/leads", { cache: "no-store" });
      if (!res.ok) {
        setError("Não foi possível carregar os leads.");
        setLoading(false);
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
  }

  async function updateStatus(leadId: string, status: LeadStatusId) {
    await fetch(`/api/consultor/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await loadLeads();
  }

  const grouped = useMemo(() => {
    const map: Record<LeadStatusId, Lead[]> = {
      NOVO: [],
      EM_ATENDIMENTO: [],
      FINALIZADO: [],
      PERDIDO: [],
      REATRIBUIDO: [],
    };
    for (const lead of leads) {
      (map[lead.status] ?? []).push(lead);
    }
    return map;
  }, [leads]);

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
              {(grouped[stage.id] || []).map((lead) => (
                <div
                  key={lead.id}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm"
                >
                  <p className="font-semibold text-sm">{lead.empresa ?? "Sem empresa"}</p>
                  <p className="text-xs text-slate-500">{lead.cnpj ?? "-"}</p>
                  <p className="text-xs text-slate-500">{lead.telefone ?? "-"}</p>
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
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
