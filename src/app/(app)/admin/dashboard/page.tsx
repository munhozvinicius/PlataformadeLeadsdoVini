"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

type KPI = {
  totalLeads: number;
  leadsAtivos: number;
  leadsEmTratativa: number;
  leadsGanhos: number;
  leadsPerdidos: number;
  taxaConversaoGeral: number;
  leadsImportadosHoje: number;
  leadsImportadosSemana: number;
};

type ConsultantPerf = {
  id: string;
  nome: string | null;
  email: string | null;
  escritorio: string | null;
  recebidos: number;
  trabalhados: number;
  ganhos: number;
  perdidos: number;
  taxaConversao: number;
  leadsParados72h: number;
  tempoMedioPrimeiroContato: number;
  tempoMedioConclusao: number;
};

type CampaignPerf = {
  id: string;
  nome: string | null;
  totalBase: number;
  atribuidos: number;
  estoque: number;
  trabalhados: number;
  ganhos: number;
  perdidos: number;
  taxaConversao: number;
  topMotivosPerda: { motivo: string | null; count: number }[];
  tempoMedio1Contato: number;
  tempoMedioConclusao: number;
};

type Heatmap = { top5Globais: { motivo: string | null; count: number }[] };
type Saude = {
  percentPhonesValid: number;
  percentDuplicidades: number;
  cidadesMaisComuns: { cidade: string; count: number }[];
  ufMaisLeads: { uf: string; count: number }[];
  ufMelhorConversao: { uf: string; taxa: number }[];
};

type Atividade = { usuario: string; leadId: string; empresa: string; acao: string | null; createdAt: string };

type DashboardPayload = {
  kpis: KPI;
  performanceConsultores: ConsultantPerf[];
  campanhas: CampaignPerf[];
  heatmap: Heatmap;
  saude: Saude;
  atividadesRecentes: Atividade[];
};

function fmtPerc(value: number) {
  if (!Number.isFinite(value)) return "0%";
  return `${Math.round(value * 100)}%`;
}

function fmtHours(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return "-";
  const hours = Math.round(ms / (1000 * 60 * 60));
  return `${hours}h`;
}

function cardColor(value: number, invert?: boolean) {
  if (!Number.isFinite(value)) return "bg-slate-50";
  const val = invert ? 1 - value : value;
  if (val >= 0.5) return "bg-emerald-50 border-emerald-100";
  if (val >= 0.25) return "bg-amber-50 border-amber-100";
  return "bg-red-50 border-red-100";
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardPayload | null>(null);

  useEffect(() => {
    if (status === "authenticated" && session?.user.role !== "MASTER") {
      router.replace("/board");
    }
  }, [status, session, router]);

  useEffect(() => {
    if (status === "authenticated" && session?.user.role === "MASTER") {
      fetchData();
    }
  }, [status, session]);

  async function fetchData() {
    setLoading(true);
    const res = await fetch("/api/admin/dashboard", { cache: "no-store" });
    if (res.ok) {
      setData(await res.json());
    }
    setLoading(false);
  }

  const funnel = useMemo(() => {
    if (!data) return [];
    return [
      { label: "Novo", value: data.kpis.leadsAtivos - data.kpis.leadsEmTratativa + data.kpis.leadsEmTratativa },
      { label: "Em contato", value: data.kpis.leadsEmTratativa },
      { label: "Em negociação", value: data.kpis.leadsEmTratativa },
      { label: "Fechado ganho", value: data.kpis.leadsGanhos },
      { label: "Fechado perdido", value: data.kpis.leadsPerdidos },
    ];
  }, [data]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Master</p>
          <h1 className="text-2xl font-semibold text-slate-900">Dashboard Master</h1>
          <p className="text-sm text-slate-500">Visão consolidada de campanhas e consultores.</p>
        </div>
        <button
          onClick={fetchData}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-100"
        >
          Atualizar
        </button>
      </div>

      {loading && <div className="text-sm text-slate-600">Carregando...</div>}

      {data ? (
        <div className="space-y-6">
          {/* KPI Header */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <KpiCard title="Total de Leads" value={data.kpis.totalLeads} />
            <KpiCard title="Leads Ativos" value={data.kpis.leadsAtivos} />
            <KpiCard title="Em Tratativa" value={data.kpis.leadsEmTratativa} />
            <KpiCard title="Ganhos" value={data.kpis.leadsGanhos} positive />
            <KpiCard title="Perdidos" value={data.kpis.leadsPerdidos} negative />
            <KpiCard title="Taxa de Conversão" value={fmtPerc(data.kpis.taxaConversaoGeral)} />
          </div>

          {/* Funnel */}
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-slate-900">Funil</h2>
              <p className="text-xs text-slate-500">
                Importados hoje: {data.kpis.leadsImportadosHoje} • Na semana: {data.kpis.leadsImportadosSemana}
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
              {funnel.map((step) => (
                <div key={step.label} className="rounded-lg border bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">{step.label}</p>
                  <p className="text-xl font-semibold text-slate-900">{step.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Ranking consultores */}
          <div className="rounded-xl border bg-white p-4 shadow-sm overflow-x-auto">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-slate-900">Ranking de Consultores</h2>
            </div>
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b">
                  <th className="py-2 pr-3">Consultor</th>
                  <th className="py-2 pr-3">Escritório</th>
                  <th className="py-2 pr-3">Recebidos</th>
                  <th className="py-2 pr-3">Trabalhados</th>
                  <th className="py-2 pr-3">Ganhos</th>
                  <th className="py-2 pr-3">Perdidos</th>
                  <th className="py-2 pr-3">Conversão</th>
                  <th className="py-2 pr-3">Parados 72h</th>
                  <th className="py-2 pr-3">T. 1º contato</th>
                  <th className="py-2 pr-3">T. Conclusão</th>
                  <th className="py-2 pr-3">Ação</th>
                </tr>
              </thead>
              <tbody>
                {data.performanceConsultores.map((c) => (
                  <tr key={`${c.email}-${c.nome}`} className="border-b last:border-b-0">
                    <td className="py-2 pr-3">{c.nome ?? c.email ?? "Consultor"}</td>
                    <td className="py-2 pr-3 text-slate-500">{c.escritorio ?? "-"}</td>
                    <td className="py-2 pr-3">{c.recebidos}</td>
                    <td className="py-2 pr-3">{c.trabalhados}</td>
                    <td className="py-2 pr-3 text-emerald-700 font-semibold">{c.ganhos}</td>
                    <td className="py-2 pr-3 text-red-600">{c.perdidos}</td>
                    <td className="py-2 pr-3">{fmtPerc(c.taxaConversao)}</td>
                    <td className="py-2 pr-3">{c.leadsParados72h}</td>
                    <td className="py-2 pr-3">{fmtHours(c.tempoMedioPrimeiroContato)}</td>
                    <td className="py-2 pr-3">{fmtHours(c.tempoMedioConclusao)}</td>
                    <td className="py-2 pr-3">
                      <a
                        className="text-xs text-blue-600 underline"
                        href={`/board?consultantId=${encodeURIComponent(c.id)}`}
                        onClick={(e) => {
                          e.preventDefault();
                          router.push(`/board?consultantId=${encodeURIComponent(c.id)}`);
                        }}
                      >
                        Ver board
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.performanceConsultores.length === 0 ? (
              <p className="text-sm text-slate-500 mt-2">Sem dados de consultores.</p>
            ) : null}
          </div>

          {/* Campanhas */}
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-900">Campanhas</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {data.campanhas.map((camp) => (
                <div key={camp.id} className="rounded-xl border bg-white p-4 shadow-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{camp.nome ?? "Campanha"}</p>
                      <p className="text-xs text-slate-500">
                        Base: {camp.totalBase} • Distribuídos: {camp.atribuidos} • Estoque: {camp.estoque}
                      </p>
                    </div>
                    <div className={`rounded-lg px-2 py-1 text-xs font-semibold ${cardColor(camp.taxaConversao)}`}>
                      {fmtPerc(camp.taxaConversao)}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                    <p>Trabalhados: {camp.trabalhados}</p>
                    <p>Ganhos: {camp.ganhos}</p>
                    <p>Perdidos: {camp.perdidos}</p>
                    <p>1º contato: {fmtHours(camp.tempoMedio1Contato)}</p>
                    <p>Conclusão: {fmtHours(camp.tempoMedioConclusao)}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs uppercase text-slate-500">Top motivos de perda</p>
                    {camp.topMotivosPerda.length === 0 ? (
                      <p className="text-xs text-slate-500">Sem dados.</p>
                    ) : (
                      camp.topMotivosPerda.map((m) => (
                        <div key={`${camp.id}-${m.motivo}`} className="flex justify-between text-sm">
                          <span>{m.motivo ?? "Outro"}</span>
                          <span className="text-slate-500">{m.count}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
            {data.campanhas.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhuma campanha encontrada.</p>
            ) : null}
          </div>

          {/* Heatmap e Saúde */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900 mb-2">Motivos de perda (Top 5)</h2>
              {data.heatmap.top5Globais.length === 0 ? (
                <p className="text-sm text-slate-500">Sem dados.</p>
              ) : (
                <div className="space-y-2">
                  {data.heatmap.top5Globais.map((m) => (
                    <div key={m.motivo ?? "motivo"} className="flex items-center justify-between">
                      <span className="text-sm">{m.motivo ?? "Outro"}</span>
                      <span className="text-sm text-slate-500">{m.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
              <h2 className="text-lg font-semibold text-slate-900">Saúde da base</h2>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg border bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">% Telefones válidos</p>
                  <p className="text-lg font-semibold">{fmtPerc(data.saude.percentPhonesValid)}</p>
                </div>
                <div className="rounded-lg border bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">% Duplicidades</p>
                  <p className="text-lg font-semibold">{fmtPerc(data.saude.percentDuplicidades)}</p>
                </div>
                <div className="rounded-lg border bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">UF com melhor conversão</p>
                  <p className="text-sm font-semibold">
                    {data.saude.ufMelhorConversao[0]?.uf ?? "-"} ({fmtPerc(data.saude.ufMelhorConversao[0]?.taxa ?? 0)})
                  </p>
                </div>
                <div className="rounded-lg border bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">UF com mais leads</p>
                  <p className="text-sm font-semibold">{data.saude.ufMaisLeads[0]?.uf ?? "-"}</p>
                </div>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-500">Cidades mais comuns</p>
                <div className="text-xs text-slate-600 flex flex-wrap gap-2">
                  {data.saude.cidadesMaisComuns.map((c) => (
                    <span key={c.cidade} className="rounded-full bg-slate-100 px-2 py-1">
                      {c.cidade} ({c.count})
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Atividade recente */}
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-slate-900">Atividade recente</h2>
            </div>
            <div className="space-y-2">
              {data.atividadesRecentes.length === 0 ? (
                <p className="text-sm text-slate-500">Sem atividades recentes.</p>
              ) : (
                data.atividadesRecentes.map((a) => (
                  <div key={`${a.leadId}-${a.createdAt}`} className="flex items-center justify-between text-sm">
                    <div>
                      <p className="font-semibold text-slate-800">
                        {a.usuario} <span className="text-slate-500 font-normal">fez</span> {a.acao ?? "atividade"}
                      </p>
                      <p className="text-xs text-slate-500">
                        Lead: {a.empresa} • {new Date(a.createdAt).toLocaleString("pt-BR")}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function KpiCard({ title, value, positive, negative }: { title: string; value: number | string; positive?: boolean; negative?: boolean }) {
  return (
    <div
      className={`rounded-xl border p-4 shadow-sm ${
        positive ? "border-emerald-100 bg-emerald-50" : negative ? "border-red-100 bg-red-50" : "bg-white"
      }`}
    >
      <p className="text-xs text-slate-500">{title}</p>
      <p className="text-2xl font-semibold text-slate-900">{typeof value === "number" ? value : value}</p>
    </div>
  );
}
