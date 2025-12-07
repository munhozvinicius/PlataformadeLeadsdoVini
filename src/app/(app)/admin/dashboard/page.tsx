"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  TrendingUp,
  Users,
  AlertTriangle,
  Clock,
  Target,
  BarChart3,
  Search,
  Activity,
  Phone,
  Building2
} from "lucide-react";

// --- Types ---

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

// --- Helpers ---

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
  if (!Number.isFinite(value)) return "bg-slate-800 text-slate-400";
  const val = invert ? 1 - value : value;
  // Using Neon/Dark logic
  if (val >= 0.5) return "bg-neon-green/10 text-neon-green border-neon-green/30";
  if (val >= 0.25) return "bg-neon-yellow/10 text-neon-yellow border-neon-yellow/30";
  return "bg-neon-pink/10 text-neon-pink border-neon-pink/30";
}

// --- Components ---

function NeonCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-pic-card border border-pic-zinc shadow-lg rounded-xl overflow-hidden ${className}`}>
      {children}
    </div>
  );
}

function KpiCard({
  title,
  value,
  subvalue,
  icon: Icon,
  variant = "blue",
}: {
  title: string;
  value: string | number;
  subvalue?: string;
  icon: React.ElementType;
  variant?: "blue" | "green" | "pink" | "red" | "yellow";
}) {
  const colors: Record<string, string> = {
    blue: "text-neon-blue border-neon-blue shadow-neon-blue",
    green: "text-neon-green border-neon-green shadow-neon-green",
    pink: "text-neon-pink border-neon-pink shadow-neon-pink",
    red: "text-red-500 border-red-500 shadow-red-500",
    yellow: "text-neon-yellow border-neon-yellow shadow-neon-yellow",
  };

  const colorClass = colors[variant] || colors.blue;

  return (
    <NeonCard className="p-5 flex flex-col justify-between h-full relative group hover:border-pic-border-highlight transition-all">
      <div className="flex justify-between items-start mb-2">
        <h3 className="text-slate-400 text-xs uppercase tracking-widest font-semibold">{title}</h3>
        <div className={`p-2 rounded-lg border bg-opacity-10 ${colorClass.split(' ')[0]} bg-${variant}-500/10 ${colorClass.split(' ')[1]}`}>
          <Icon className={`w-5 h-5`} />
        </div>
      </div>
      <div>
        <div className={`text-3xl font-bold font-mono tracking-tighter ${colorClass.split(' ')[0]} drop-shadow-sm`}>
          {value}
        </div>
        {subvalue && <p className="text-xs text-slate-500 mt-1 font-medium">{subvalue}</p>}
      </div>
      {/* Decorative Glow */}
      <div className={`absolute -bottom-4 -right-4 w-24 h-24 bg-${variant}-500/5 rounded-full blur-2xl group-hover:bg-${variant}-500/10 transition-all`} />
    </NeonCard>
  );
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardPayload | null>(null);

  useEffect(() => {
    if (status === "authenticated" && session?.user.role !== "MASTER" && session?.user.role !== "GERENTE_SENIOR" && session?.user.role !== "PROPRIETARIO") {
      router.replace("/board");
    }
  }, [status, session, router]);

  useEffect(() => {
    if (status === "authenticated") {
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

  // --- Computed Metrics Strategy ---
  // "Agilidade de Contato" Global Average (weighted by 'trabalhados' to exclude inactive)
  const averageFirstContactTime = useMemo(() => {
    if (!data?.performanceConsultores) return 0;
    const consultants = data.performanceConsultores.filter(c => c.tempoMedioPrimeiroContato > 0);
    if (consultants.length === 0) return 0;
    const total = consultants.reduce((acc, curr) => acc + curr.tempoMedioPrimeiroContato, 0);
    return total / consultants.length;
  }, [data]);

  // "Leads Parados > 72h" Total
  const totalStalledLeads = useMemo(() => {
    if (!data?.performanceConsultores) return 0;
    return data.performanceConsultores.reduce((acc, curr) => acc + curr.leadsParados72h, 0);
  }, [data]);

  const funnel = useMemo(() => {
    if (!data) return [];
    return [
      { label: "BANCADA (NOVO)", value: data.kpis.leadsAtivos - data.kpis.leadsEmTratativa + data.kpis.leadsEmTratativa, color: "text-white" },
      { label: "EM TRATATIVA", value: data.kpis.leadsEmTratativa, color: "text-neon-blue" },
      { label: "NEGOCIAÇÃO", value: data.kpis.leadsEmTratativa, color: "text-neon-yellow" },
      { label: "GANHO", value: data.kpis.leadsGanhos, color: "text-neon-green" },
      { label: "PERDIDO", value: data.kpis.leadsPerdidos, color: "text-neon-pink" },
    ];
  }, [data]);

  return (
    <div className="min-h-screen bg-pic-dark -m-6 p-6">
      <div className="max-w-7xl mx-auto space-y-8">

        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-pic-zinc pb-6">
          <div>
            <h1 className="text-3xl font-black text-white uppercase tracking-tighter mb-1">
              Dashboard <span className="text-neon-pink">Estratégico</span>
            </h1>
            <p className="text-slate-400 text-sm">Visão consolidada de performance, agilidade e resultados.</p>
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-pic-card border border-pic-zinc hover:border-neon-blue text-white rounded-lg transition-all text-xs font-bold uppercase tracking-wider"
          >
            <Activity className="w-4 h-4 text-neon-blue" />
            {loading ? "Atualizando..." : "Atualizar Dados"}
          </button>
        </div>

        {data ? (
          <>
            {/* Strategic KPIs - Top Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard
                title="Agilidade (1º Contato)"
                value={fmtHours(averageFirstContactTime)}
                subvalue="Média da Equipe"
                icon={Clock}
                variant="blue"
              />
              <KpiCard
                title="Risco (Parados > 72h)"
                value={totalStalledLeads}
                subvalue="Leads sem interação"
                icon={AlertTriangle}
                variant={totalStalledLeads > 0 ? "red" : "green"}
              />
              <KpiCard
                title="Conversão Global"
                value={fmtPerc(data.kpis.taxaConversaoGeral)}
                subvalue={`${data.kpis.leadsGanhos} fechamentos`}
                icon={TrendingUp}
                variant="green"
              />
              <KpiCard
                title="Pipeline Ativo"
                value={data.kpis.leadsAtivos}
                subvalue="Leads na esteira"
                icon={Target}
                variant="yellow"
              />
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

              {/* Left Column: Funnel & Rankings (2/3 width) */}
              <div className="lg:col-span-2 space-y-6">

                {/* Funnel Section */}
                <NeonCard className="p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                      <BarChart3 className="w-5 h-5 text-neon-pink" />
                      Funil de Vendas
                    </h2>
                    <span className="text-xs text-slate-500 font-mono">
                      HOJE: +{data.kpis.leadsImportadosHoje} LEADS
                    </span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    {funnel.map((step, idx) => (
                      <div key={idx} className="flex flex-col items-center justify-center p-4 bg-pic-dark rounded-lg border border-pic-zinc relative overflow-hidden">
                        <span className="text-[10px] uppercase font-bold text-slate-500 mb-1 z-10">{step.label}</span>
                        <span className={`text-2xl font-black font-mono ${step.color} z-10`}>{step.value}</span>
                        <div className={`absolute bottom-0 left-0 w-full h-1 ${step.color.replace('text-', 'bg-')}`} />
                      </div>
                    ))}
                  </div>
                </NeonCard>

                {/* Consultants Ranking Table */}
                <NeonCard className="overflow-hidden">
                  <div className="p-6 border-b border-pic-zinc flex justify-between items-center">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                      <Users className="w-5 h-5 text-neon-blue" />
                      Performance por Consultor
                    </h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="text-[10px] uppercase tracking-wider text-slate-500 bg-pic-dark">
                        <tr>
                          <th className="px-6 py-4 font-bold">Consultor</th>
                          <th className="px-6 py-4 font-bold text-right">Recebidos</th>
                          <th className="px-6 py-4 font-bold text-right">Ganhos</th>
                          <th className="px-6 py-4 font-bold text-right">Conversão</th>
                          <th className="px-6 py-4 font-bold text-right text-red-500">Parados 72h</th>
                          <th className="px-6 py-4 font-bold text-right">Agilidade</th>
                          <th className="px-6 py-4 font-bold text-center">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-pic-zinc">
                        {data.performanceConsultores.map((c) => (
                          <tr key={c.id} className="hover:bg-pic-dark/50 transition-colors group">
                            <td className="px-6 py-4 font-medium text-white flex flex-col">
                              <span>{c.nome || c.email}</span>
                              <span className="text-xs text-slate-500">{c.escritorio || "-"}</span>
                            </td>
                            <td className="px-6 py-4 text-slate-300 text-right font-mono">{c.recebidos}</td>
                            <td className="px-6 py-4 text-neon-green font-bold text-right font-mono">{c.ganhos}</td>
                            <td className="px-6 py-4 text-white text-right font-mono">{fmtPerc(c.taxaConversao)}</td>
                            <td className={`px-6 py-4 font-bold text-right font-mono ${c.leadsParados72h > 0 ? 'text-red-500' : 'text-slate-500'}`}>
                              {c.leadsParados72h}
                            </td>
                            <td className="px-6 py-4 text-slate-300 text-right font-mono">{fmtHours(c.tempoMedioPrimeiroContato)}</td>
                            <td className="px-6 py-4 text-center">
                              <button
                                onClick={() => router.push(`/board?consultantId=${c.id}`)}
                                className="text-white hover:text-neon-blue p-2 rounded hover:bg-neon-blue/10 transition-colors"
                                title="Ver Board"
                              >
                                <Search className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {data.performanceConsultores.length === 0 && (
                    <div className="p-8 text-center text-slate-500">Nenhum dado disponível.</div>
                  )}
                </NeonCard>

              </div>

              {/* Right Column: Health & Campaigns (1/3 width) */}
              <div className="space-y-6">

                {/* Campaigns List */}
                <NeonCard className="p-6">
                  <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-4 border-b border-pic-zinc pb-2">Campanhas Ativas</h2>
                  <div className="space-y-4">
                    {data.campanhas.map((camp) => (
                      <div key={camp.id} className="group">
                        <div className="flex justify-between items-start mb-1">
                          <p className="text-white font-medium text-sm group-hover:text-neon-pink transition-colors">{camp.nome}</p>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded border ${cardColor(camp.taxaConversao)}`}>
                            {fmtPerc(camp.taxaConversao)}
                          </span>
                        </div>
                        <div className="flex justify-between text-xs text-slate-500 mb-2">
                          <span>Base: {camp.totalBase}</span>
                          <span>Ganhos: {camp.ganhos}</span>
                        </div>
                        {/* Mini Progress Bar */}
                        <div className="w-full bg-pic-zinc h-1 rounded-full overflow-hidden">
                          <div
                            className="bg-neon-pink h-full"
                            style={{ width: `${(camp.trabalhados / (camp.totalBase || 1)) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                    {data.campanhas.length === 0 && <p className="text-slate-500 text-sm">Sem campanhas.</p>}
                  </div>
                </NeonCard>

                {/* Health Stats */}
                <NeonCard className="p-6 bg-gradient-to-br from-pic-card to-pic-dark">
                  <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-4 border-b border-pic-zinc pb-2 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-neon-green" />
                    Saúde da Base
                  </h2>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-400 flex items-center gap-2">
                        <Phone className="w-4 h-4" /> Telefones Válidos
                      </span>
                      <span className="text-white font-mono font-bold">{fmtPerc(data.saude.percentPhonesValid)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-400 flex items-center gap-2">
                        <Building2 className="w-4 h-4" /> Duplicidades
                      </span>
                      <span className="text-white font-mono font-bold">{fmtPerc(data.saude.percentDuplicidades)}</span>
                    </div>

                    <div className="pt-4 border-t border-pic-zinc">
                      <p className="text-xs text-slate-500 mb-2 uppercase">Melhor Conversão (UF)</p>
                      <div className="flex items-center justify-between">
                        <span className="text-neon-yellow font-bold text-lg">{data.saude.ufMelhorConversao[0]?.uf || "-"}</span>
                        <span className="text-slate-300 font-mono">{fmtPerc(data.saude.ufMelhorConversao[0]?.taxa || 0)}</span>
                      </div>
                    </div>
                  </div>
                </NeonCard>

              </div>

            </div>
          </>
        ) : (
          <div className="text-center py-20">
            <div className="animate-spin w-10 h-10 border-4 border-neon-blue border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-slate-400 animate-pulse">Carregando inteligência...</p>
          </div>
        )}
      </div>
    </div>
  );
}
