"use client";

import { useCallback, useEffect, useState } from "react";

type Metrics = {
  totalLeads: number;
  workedLeads: number;
  notWorkedLeads: number;
  contactRate: number;
  negotiationRate: number;
  closeRate: number;
  lossReasons: { outcomeLabel: string | null; _count: { outcomeLabel: number } }[];
  avgActivities: number;
  followUps: number;
  byStatus?: { status: string; count: number }[];
  weekly?: { label: string; count: number }[];
};

export default function ConsultantDashboardPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [campaignId, setCampaignId] = useState<string>("all");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (campaignId) params.set("campaignId", campaignId);
    const res = await fetch(`/api/consultor/metrics?${params.toString()}`, { cache: "no-store" });
    if (res.ok) setMetrics(await res.json());
    setLoading(false);
  }, [campaignId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Consultor</p>
          <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-600">Cadência, efetividade e pendências</p>
        </div>
        <select
          value={campaignId}
          onChange={(e) => setCampaignId(e.target.value)}
          className="rounded-lg border px-3 py-2 text-sm"
        >
          <option value="all">Todas as campanhas</option>
          {/* Em produção, popular com campanhas do consultor */}
          <option value="placeholder">Campanha placeholder</option>
        </select>
      </header>

      {loading ? <p className="text-sm text-slate-600">Carregando...</p> : null}
      {metrics ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <MetricCard title="Leads recebidos" value={metrics.totalLeads} subtitle={`Trabalhados: ${metrics.workedLeads}`} />
            <MetricCard title="Taxa de contato" value={`${metrics.contactRate}%`} subtitle={`Não trabalhados: ${metrics.notWorkedLeads}`} />
            <MetricCard title="Taxa de fechamento" value={`${metrics.closeRate}%`} subtitle={`Negociação: ${metrics.negotiationRate}%`} />
            <MetricCard title="Atividades/lead" value={metrics.avgActivities} subtitle={`Follow-ups 7d: ${metrics.followUps}`} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-slate-900 mb-2">Principais motivos de perda</p>
              <ul className="text-sm text-slate-700 space-y-1">
                {metrics.lossReasons?.map((r) => (
                  <li key={r.outcomeLabel ?? "null"} className="flex justify-between">
                    <span>{r.outcomeLabel ?? "—"}</span>
                    <span className="text-slate-500">{r._count.outcomeLabel}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-slate-900 mb-2">Resumo por status</p>
              <div className="space-y-1 text-sm text-slate-700">
                {metrics.byStatus?.map((s) => (
                  <div key={s.status} className="flex justify-between">
                    <span>{s.status}</span>
                    <span className="text-slate-500">{s.count}</span>
                  </div>
                )) ?? <p className="text-slate-500 text-sm">Sem dados</p>}
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function MetricCard({ title, value, subtitle }: { title: string; value: number | string; subtitle?: string }) {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <p className="text-xs uppercase text-slate-500">{title}</p>
      <p className="text-2xl font-semibold text-slate-900">{value}</p>
      {subtitle ? <p className="text-sm text-slate-500">{subtitle}</p> : null}
    </div>
  );
}
