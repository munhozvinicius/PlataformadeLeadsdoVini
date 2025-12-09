"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { LEAD_STATUS, LeadStatusId } from "@/constants/leadStatus";
import { Role, Profile } from "@prisma/client";
import { LeadCard } from "@/components/leads/LeadCard";
import { LeadDetailModal } from "@/components/leads/LeadDetailModal";

type ViewerRole = Role | Profile;

type Lead = {
  id: string;
  razaoSocial?: string | null;
  nomeFantasia?: string | null;
  cidade?: string | null;
  estado?: string | null;
  telefone?: string | null;
  telefone1?: string | null;
  telefone2?: string | null;
  telefone3?: string | null;
  cnpj?: string | null;
  documento?: string | null;
  vertical?: string | null;
  endereco?: string | null;
  emails?: string[];
  logradouro?: string | null;
  numero?: string | null;
  cep?: string | null;
  territorio?: string | null;
  ofertaMkt?: string | null;
  estrategia?: string | null;
  vlFatPresumido?: string | null;
  cnae?: string | null;
  status: LeadStatusId;
  campanha?: { id?: string; nome: string } | null;
  consultor?: { id: string; name?: string | null; email?: string | null } | null;
  isWorked?: boolean;
  lastActivityAt?: string | null;
  nextFollowUpAt?: string | null;
  nextStepNote?: string | null;
  createdAt?: string | null;
  site?: string | null;
  contatoPrincipal?: { nome?: string; cargo?: string; telefone?: string; email?: string };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  productCart?: any[] | null;
  telefones?: { rotulo: string; valor: string }[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  externalData?: any;
};

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
};

type ConsultantBoardProps = {
  viewerRole: ViewerRole;
  consultantId?: string;
  campaignId?: string;
  refreshSignal: number;
  onCampaignsUpdate?: (campaigns: { id: string; name: string }[]) => void;
  officeIds?: string[];
};

function ConsultantBoard({
  viewerRole,
  consultantId,
  campaignId,
  refreshSignal,
  onCampaignsUpdate,
  officeIds,
}: ConsultantBoardProps) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);

  const loadLeads = useCallback(async () => {
    setLoading(true);
    setError("");
    if (viewerRole === "PROPRIETARIO" && !consultantId) {
      setLeads([]);
      setLoading(false);
      return;
    }
    const params = new URLSearchParams();
    if (consultantId) params.set("consultantId", consultantId);
    if (campaignId && campaignId !== "all") params.set("campaignId", campaignId);
    if (officeIds && officeIds.length) params.set("officeIds", officeIds.join(","));
    try {
      const res = await fetch(`/api/consultor/leads?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) {
        setError("Erro ao carregar leads.");
        setLeads([]);
        return;
      }
      const data = (await res.json()) as Lead[];
      setLeads(data);
      const campaignsFound = Array.from(
        new Map(
          data
            .filter((l) => l.campanha?.id || l.campanha?.nome)
            .map((l) => [l.campanha?.id ?? l.campanha?.nome ?? "", l.campanha?.nome ?? ""]),
        ).entries(),
      ).map(([id, name]) => ({ id, name }));
      onCampaignsUpdate?.(campaignsFound);
    } catch (err) {
      console.error(err);
      setError("Erro ao carregar leads.");
    } finally {
      setLoading(false);
    }
  }, [viewerRole, consultantId, campaignId, onCampaignsUpdate, officeIds]);

  const loadMetrics = useCallback(async () => {
    if (viewerRole === "PROPRIETARIO" && !consultantId) {
      setMetrics(null);
      return;
    }
    const params = new URLSearchParams();
    if (consultantId) params.set("consultantId", consultantId);
    if (campaignId && campaignId !== "all") params.set("campaignId", campaignId);
    if (officeIds && officeIds.length) params.set("officeIds", officeIds.join(","));
    const res = await fetch(`/api/consultor/metrics?${params.toString()}`, { cache: "no-store" });
    if (res.ok) {
      setMetrics(await res.json());
    }
  }, [viewerRole, consultantId, campaignId, officeIds]);

  useEffect(() => {
    loadLeads();
    loadMetrics();
  }, [loadLeads, loadMetrics, refreshSignal]);

  const grouped = useMemo(() => {
    const map: Record<LeadStatusId, Lead[]> = {
      NOVO: [],
      EM_CONTATO: [],
      EM_NEGOCIACAO: [],
      FECHADO: [],
      PERDIDO: [],
    };
    leads.forEach((lead) => {
      (map[lead.status] ?? []).push(lead);
    });
    return map;
  }, [leads]);

  // summary removed as unused

  const selectedLead = useMemo(() => leads.find((l) => l.id === selectedLeadId), [leads, selectedLeadId]);

  return (
    <div className="space-y-6">
      {/* Metrics Section */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-pic-card border border-pic-zinc p-4 rounded-sm flex flex-col justify-between hover:border-neon-pink transition-colors group">
          <span className="text-[10px] uppercase tracking-widest text-slate-500 group-hover:text-neon-pink transition-colors">Total Leads</span>
          <span className="text-3xl font-black text-white">{metrics?.totalLeads ?? 0}</span>
          <span className="text-[10px] text-slate-600">Trabalhados: {metrics?.workedLeads ?? 0}</span>
        </div>
        <div className="bg-pic-card border border-pic-zinc p-4 rounded-sm flex flex-col justify-between hover:border-neon-green transition-colors group">
          <span className="text-[10px] uppercase tracking-widest text-slate-500 group-hover:text-neon-green transition-colors">Taxa Contato</span>
          <span className="text-3xl font-black text-white">{metrics?.contactRate ?? 0}%</span>
          <span className="text-[10px] text-slate-600">Pendentes: {metrics?.notWorkedLeads ?? 0}</span>
        </div>
        <div className="bg-pic-card border border-pic-zinc p-4 rounded-sm flex flex-col justify-between hover:border-neon-blue transition-colors group">
          <span className="text-[10px] uppercase tracking-widest text-slate-500 group-hover:text-neon-blue transition-colors">Negociação</span>
          <span className="text-3xl font-black text-white">{metrics?.negotiationRate ?? 0}%</span>
          <span className="text-[10px] text-slate-600">Ativ. média: {metrics?.avgActivities ?? 0}</span>
        </div>
        <div className="bg-pic-card border border-pic-zinc p-4 rounded-sm flex flex-col justify-between hover:border-white transition-colors group">
          <span className="text-[10px] uppercase tracking-widest text-slate-500 group-hover:text-white transition-colors">Fechamento</span>
          <span className="text-3xl font-black text-white">{metrics?.closeRate ?? 0}%</span>
          <span className="text-[10px] text-slate-600">Follow-ups: {metrics?.followUps ?? 0}</span>
        </div>
      </div>

      {error ? <div className="p-4 bg-red-900/20 border border-red-500 text-red-200 text-sm font-mono">{error}</div> : null}

      {loading ? (
        <div className="flex items-center justify-center p-12">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-neon-pink"></div>
        </div>
      ) : null}

      {viewerRole === "MASTER" && !consultantId ? (
        <div className="p-12 text-center border-2 border-dashed border-pic-zinc rounded-sm">
          <p className="text-slate-500 font-mono text-sm uppercase">Selecione um consultor para visualizar o board</p>
        </div>
      ) : null}

      {/* Kanban Board */}
      <div className="grid grid-cols-5 gap-4 pb-4 min-h-[calc(100vh-280px)] w-full">
        {LEAD_STATUS.map((stage) => (
          <div
            key={stage.id}
            className="flex flex-col bg-pic-dark/50 rounded-sm border-t-2 border-transparent hover:border-neon-pink/30 transition-colors min-w-0"
          >
            {/* Column Header */}
            <div className="p-3 mb-2 flex items-center justify-between border-b border-pic-zinc bg-pic-card/30">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-300">{stage.title}</h2>
              <span className="bg-pic-zinc text-white text-[10px] px-2 py-0.5 rounded-full font-bold">
                {grouped[stage.id]?.length ?? 0}
              </span>
            </div>

            {/* Column Content */}
            <div className="flex-1 p-2 space-y-3 overflow-y-auto custom-scrollbar max-h-[800px]">
              {(grouped[stage.id] || []).map((lead) => (
                <LeadCard
                  key={lead.id}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  lead={lead as any}
                  onOpen={() => setSelectedLeadId(lead.id)}
                />
              ))}
              {grouped[stage.id]?.length === 0 && (
                <div className="h-24 flex items-center justify-center border-2 border-dashed border-pic-zinc/50 opacity-50">
                  <span className="text-[10px] uppercase text-slate-600">Vazio</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {selectedLead && (
        <LeadDetailModal
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          lead={selectedLead as any}
          onClose={() => setSelectedLeadId(null)}
          onRefresh={async () => {
            await loadLeads();
            await loadMetrics();
          }}
        />
      )}
    </div>
  );
}

export default function BoardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [consultants, setConsultants] = useState<{ id: string; name: string; email: string; role: string }[]>([]);
  const [selectedConsultant, setSelectedConsultant] = useState<string>("");
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [selectedCampaign, setSelectedCampaign] = useState<string>("all");
  const [campaignOptions, setCampaignOptions] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  const loadConsultants = useCallback(async () => {
    const res = await fetch("/api/admin/users?role=CONSULTANT", { cache: "no-store" });
    if (res.ok) {
      setConsultants(await res.json());
    }
  }, []);

  const loadOffices = useCallback(async () => {
    // Placeholder if office filter needed
  }, []);

  useEffect(() => {
    if (session?.user.role === "PROPRIETARIO" || session?.user.role === "GERENTE_SENIOR" || session?.user.role === "GERENTE_NEGOCIOS") {
      loadConsultants();
      loadOffices();
    }
  }, [session, loadConsultants, loadOffices]);

  // Set default consultant if user is consultant
  useEffect(() => {
    if (session?.user.role === "CONSULTOR" && session.user.id) {
      setSelectedConsultant(session.user.id);
    }
  }, [session]);

  const viewerRole = (session?.user.role as ViewerRole) ?? "CONSULTOR";

  return (
    <main className="min-h-screen bg-pic-dark text-slate-200 overflow-hidden flex flex-col">
      {/* Top Bar / Filters */}
      <div className="bg-pic-dark/95 backdrop-blur z-20 border-b border-pic-zinc sticky top-0">
        <div className="p-4 flex flex-col md:flex-row gap-4 items-center justify-between max-w-[1920px] mx-auto w-full">

          <div className="flex items-center gap-4">
            <h1 className="text-xl font-black text-white uppercase tracking-tighter">
              Área de <span className="text-neon-pink">Trabalho</span>
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {/* Consultant Filter (Admin only) */}
            {(viewerRole === "PROPRIETARIO" || viewerRole === "GERENTE_SENIOR" || viewerRole === "GERENTE_NEGOCIOS") && (
              <div className="relative group">
                <select
                  value={selectedConsultant}
                  onChange={(e) => setSelectedConsultant(e.target.value)}
                  className="bg-black border border-pic-zinc text-slate-300 text-xs uppercase font-bold py-2 px-3 pr-8 focus:border-neon-blue outline-none appearance-none min-w-[200px]"
                >
                  <option value="">Selecione Consultor...</option>
                  {consultants.map(c => (
                    <option key={c.id} value={c.id}>{c.name || c.email}</option>
                  ))}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none text-[10px]">▼</div>
              </div>
            )}

            {/* Campaign Filter */}
            <div className="relative group">
              <select
                value={selectedCampaign}
                onChange={(e) => setSelectedCampaign(e.target.value)}
                className="bg-black border border-pic-zinc text-slate-300 text-xs uppercase font-bold py-2 px-3 pr-8 focus:border-neon-green outline-none appearance-none min-w-[180px]"
              >
                <option value="all">Todas Campanhas</option>
                {campaignOptions.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none text-[10px]">▼</div>
            </div>

            <button
              onClick={() => setRefreshSignal(prev => prev + 1)}
              className="w-8 h-8 flex items-center justify-center border border-pic-zinc text-slate-400 hover:text-white hover:border-white transition-colors"
              title="Atualizar"
            >
              ↻
            </button>
          </div>
        </div>
      </div>

      {/* Main Board Area */}
      <div className="flex-1 overflow-hidden p-6 relative">
        {/* Background Grid Accent */}
        <div className="absolute inset-0 bg-[url('/grid-pattern.svg')] opacity-[0.03] pointer-events-none"></div>
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-neon-pink/20 to-transparent"></div>

        <div className="h-full max-w-[1920px] mx-auto w-full">
          <ConsultantBoard
            viewerRole={viewerRole}
            consultantId={selectedConsultant}
            campaignId={selectedCampaign}
            refreshSignal={refreshSignal}
            onCampaignsUpdate={setCampaignOptions}
          />
        </div>
      </div>
    </main>
  );
}
