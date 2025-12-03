"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { LeadStatus } from "@prisma/client";

type CampaignDetail = {
  campaign: { id: string; nome: string; descricao?: string | null; status?: string | null };
  resumo: { total: number; atribuidos: number; estoque: number; ganhos: number; perdidos: number };
  topMotivosPerda: { label: string | null; count: number }[];
};

type DistributionRow = {
  officeName: string;
  consultantId: string;
  consultantName: string;
  totalAtribuidos: number;
  trabalhados: number;
  restantes: number;
  fechados: number;
  perdidos: number;
};

type LeadItem = {
  id: string;
  documento?: string | null;
  razaoSocial?: string | null;
  nomeFantasia?: string | null;
  cidade?: string | null;
  estado?: string | null;
  cnpj?: string | null;
  vlFatPresumido?: string | null;
  telefone1?: string | null;
  telefone2?: string | null;
  telefone3?: string | null;
  logradouro?: string | null;
  territorio?: string | null;
  ofertaMkt?: string | null;
  cep?: string | null;
  numero?: string | null;
  estrategia?: string | null;
  vertical?: string | null;
  status: LeadStatus;
  consultor?: { id: string; name?: string | null; email?: string | null } | null;
};

export default function CampaignDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { data: session, status } = useSession();
  const [, setLogs] = useState<{
    activities: { id: string; action: string; user: string; lead: string; timestamp: string }[];
    distributions: { id: string; admin: string; consultant: string; leadsSent: number; rulesApplied: string; timestamp: string }[];
  } | null>(null);
  const [audit, setAudit] = useState<{ total: number; invalidPhones: number; duplicated: number; invalids: number } | null>(null);
  const [detail, setDetail] = useState<CampaignDetail | null>(null);
  const [distribution, setDistribution] = useState<DistributionRow[]>([]);
  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [filters, setFilters] = useState({ status: "", consultorId: "", cidade: "", uf: "", estrategia: "", vertical: "" });
  const [consultants, setConsultants] = useState<{ id: string; name?: string | null; email?: string | null }[]>([]);
  const [qty, setQty] = useState(10);
  const [selectedConsultor, setSelectedConsultor] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (status === "authenticated" && session?.user.role !== "MASTER") {
      router.replace("/board");
    }
  }, [status, session, router]);

  const conversao = useMemo(() => {
    if (!detail) return 0;
    return detail.resumo.total ? detail.resumo.ganhos / detail.resumo.total : 0;
  }, [detail]);

  const loadDetail = useCallback(async () => {
    const res = await fetch(`/api/campaigns/${id}`, { cache: "no-store" });
    if (res.ok) setDetail(await res.json());
  }, [id]);

  const loadDistribution = useCallback(async () => {
    const res = await fetch(`/api/campaigns/${id}/distribution`, { cache: "no-store" });
    if (res.ok) {
      const json = await res.json();
      setDistribution(json.distribution ?? []);
    }
  }, [id]);

  const loadLeads = useCallback(async () => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v) params.append(k, v);
    });
    const res = await fetch(`/api/campaigns/${id}/leads?${params.toString()}`, { cache: "no-store" });
    if (res.ok) {
      const json = await res.json();
      setLeads(json.items ?? []);
    }
  }, [filters, id]);

  const loadLogs = useCallback(async () => {
    const res = await fetch(`/api/campaign/${id}/logs`, { cache: "no-store" });
    if (res.ok) setLogs(await res.json());
  }, [id]);

  const loadAudit = useCallback(async () => {
    const res = await fetch(`/api/campaign/${id}/audit`, { cache: "no-store" });
    if (res.ok) setAudit(await res.json());
  }, [id]);

  const loadConsultants = useCallback(async () => {
    const res = await fetch("/api/admin/users", { cache: "no-store" });
    if (res.ok) {
      const users = (await res.json()) as { id: string; name?: string | null; email?: string | null; role: string }[];
      setConsultants(users.filter((u) => u.role === "CONSULTOR"));
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated" && id) {
      loadDetail();
      loadDistribution();
      loadLeads();
      loadConsultants();
    }
  }, [status, id, loadDetail, loadDistribution, loadLeads, loadConsultants]);

  useEffect(() => {
    if (status === "authenticated" && id) {
      loadLogs();
      loadAudit();
    }
  }, [status, id, loadLogs, loadAudit]);

  async function distribute() {
    setMessage("");
    if (!selectedConsultor) {
      setMessage("Selecione um consultor.");
      return;
    }
    const res = await fetch(`/api/campaigns/${id}/distribution`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consultantIds: [selectedConsultor], quantityPerConsultant: qty }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      setMessage(err?.message ?? "Erro ao distribuir.");
      return;
    }
    setMessage("Distribuição realizada.");
    await Promise.all([loadDetail(), loadDistribution(), loadLeads()]);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Campanha</p>
          <h1 className="text-2xl font-semibold text-slate-900">{detail?.campaign.nome ?? "Campanha"}</h1>
          <p className="text-sm text-slate-500">{detail?.campaign.descricao}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadLogs}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-100"
          >
            Logs
          </button>
          <button
            onClick={() => {
              window.location.href = `/api/admin/export`;
            }}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-100"
          >
            Exportar campanha
          </button>
          <button
            onClick={() => router.back()}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-100"
          >
            Voltar
          </button>
        </div>
      </div>

      {message ? <div className="text-sm text-slate-700">{message}</div> : null}

      {/* D1 */}
      <div className="rounded-2xl border bg-white/70 backdrop-blur p-4 shadow-sm grid grid-cols-2 md:grid-cols-3 gap-3">
        <ResumoCard title="Total" value={detail?.resumo.total ?? 0} />
        <ResumoCard title="Atribuídos" value={detail?.resumo.atribuidos ?? 0} />
        <ResumoCard title="Estoque" value={detail?.resumo.estoque ?? 0} />
        <ResumoCard title="Ganhos" value={detail?.resumo.ganhos ?? 0} />
        <ResumoCard title="Perdidos" value={detail?.resumo.perdidos ?? 0} />
        <ResumoCard title="Conversão" value={`${Math.round(conversao * 100)}%`} />
        {audit ? (
          <>
            <ResumoCard title="Telefones inválidos" value={audit.invalidPhones} />
            <ResumoCard title="Duplicados" value={audit.duplicated} />
          </>
        ) : null}
      </div>

      {/* D2 */}
      <div className="rounded-2xl border bg-white/70 backdrop-blur p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Distribuição de Leads</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
          <div className="space-y-1">
            <label className="text-xs text-slate-600">Consultor</label>
            <select
              value={selectedConsultor}
              onChange={(e) => setSelectedConsultor(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            >
              <option value="">Selecione</option>
              {consultants.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name ?? c.email}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-slate-600">Quantidade por consultor</label>
            <input
              type="number"
              value={qty}
              min={1}
              onChange={(e) => setQty(Number(e.target.value))}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
          </div>
          <button
            onClick={distribute}
            className="rounded-lg bg-slate-900 text-white px-3 py-2 text-sm font-semibold hover:bg-slate-800"
          >
            Distribuir leads
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="py-2 pr-3">Consultor</th>
                <th className="py-2 pr-3">Atribuídos</th>
                <th className="py-2 pr-3">Trabalhados</th>
                <th className="py-2 pr-3">Restantes</th>
                <th className="py-2 pr-3">Ganhos</th>
                <th className="py-2 pr-3">Perdidos</th>
              </tr>
            </thead>
            <tbody>
              {distribution.map((d) => (
                <tr key={d.consultantId} className="border-b last:border-b-0">
                  <td className="py-2 pr-3">{d.consultantName}</td>
                  <td className="py-2 pr-3">{d.totalAtribuidos}</td>
                  <td className="py-2 pr-3">{d.trabalhados}</td>
                  <td className="py-2 pr-3">{d.restantes}</td>
                  <td className="py-2 pr-3">{d.fechados}</td>
                  <td className="py-2 pr-3">{d.perdidos}</td>
                </tr>
              ))}
              {distribution.length === 0 ? (
                <tr>
                  <td className="py-2 pr-3 text-sm text-slate-500" colSpan={6}>
                    Sem dados de distribuição.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {/* D3 */}
      <div className="rounded-2xl border bg-white/70 backdrop-blur p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Estoque da campanha</h2>
              <button onClick={loadLeads} className="text-sm underline text-blue-700">
                Atualizar
              </button>
            </div>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-2">
          {[
            { key: "status", label: "Status" },
            { key: "consultorId", label: "Consultor" },
            { key: "cidade", label: "Cidade" },
            { key: "uf", label: "UF" },
            { key: "estrategia", label: "Estratégia" },
            { key: "vertical", label: "Vertical" },
          ].map((f) => (
            <input
              key={f.key}
              placeholder={f.label}
              value={filters[f.key as keyof typeof filters]}
              onChange={(e) => setFilters((prev) => ({ ...prev, [f.key as keyof typeof filters]: e.target.value }))}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="py-2 pr-3">Documento</th>
                <th className="py-2 pr-3">Empresa</th>
                <th className="py-2 pr-3">Cidade/UF</th>
                <th className="py-2 pr-3">Faturamento</th>
                <th className="py-2 pr-3">Telefones</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Consultor</th>
                <th className="py-2 pr-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id} className="border-b last:border-b-0">
                  <td className="py-2 pr-3">{lead.documento ?? lead.cnpj ?? "-"}</td>
                  <td className="py-2 pr-3">{lead.razaoSocial ?? lead.nomeFantasia ?? "-"}</td>
                  <td className="py-2 pr-3">
                    {lead.cidade ?? "-"} {lead.estado ? `/${lead.estado}` : ""}
                  </td>
                  <td className="py-2 pr-3">{lead.vlFatPresumido ?? "-"}</td>
                  <td className="py-2 pr-3">
                    {[lead.telefone1, lead.telefone2, lead.telefone3].filter(Boolean).join(" / ") || "-"}
                  </td>
                  <td className="py-2 pr-3">{lead.status}</td>
                  <td className="py-2 pr-3">{lead.consultor?.name ?? lead.consultor?.email ?? "-"}</td>
                  <td className="py-2 pr-3 space-x-2">
                    <button
                      onClick={async () => {
                        if (!selectedConsultor) return;
                        await fetch("/api/lead/reassign", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ leadId: lead.id, consultantId: selectedConsultor }),
                        });
                        await loadLeads();
                      }}
                      className="text-xs text-blue-700 underline"
                    >
                      Reatribuir
                    </button>
                    <button
                      onClick={async () => {
                        await fetch(`/api/lead/${lead.id}/update`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ status: LeadStatus.PERDIDO }),
                        });
                        await loadLeads();
                      }}
                      className="text-xs text-red-600 underline"
                    >
                      Invalidar
                    </button>
                  </td>
                </tr>
              ))}
              {leads.length === 0 ? (
                <tr>
                  <td className="py-2 pr-3 text-sm text-slate-500" colSpan={7}>
                    Nenhum lead encontrado.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ResumoCard({ title, value }: { title: string; value: number | string }) {
  return (
    <div className="rounded-xl border bg-white p-3 shadow-sm">
      <p className="text-xs uppercase text-slate-500">{title}</p>
      <p className="text-xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}
