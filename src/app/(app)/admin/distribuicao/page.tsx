"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Users, BarChart3, RefreshCw, FileSpreadsheet, Plus } from "lucide-react";

// Types
type User = { id: string; name: string; email: string; role: string; escritorio: string };
type CampaignSummary = {
  id: string;
  nome: string;
  descricao?: string;
  totalLeads: number;
  assignedLeads: number;
  remainingLeads: number;
  consultoresReceberam: number;
};
type ConsultantStat = {
  id: string;
  name: string;
  email: string;
  totalLeads: number;
  workedLeads: number;
  contactedLeads: number;
  closedLeads: number;
  lastActivity: string | null;
};

export default function DistribuicaoPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [activeTab, setActiveTab] = useState<"dashboard" | "create">("dashboard");

  // State - Dashboard
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>("");
  const [consultantsStats, setConsultantsStats] = useState<ConsultantStat[]>([]);
  const [allConsultants, setAllConsultants] = useState<User[]>([]); // For distribution list
  const [loadingStats, setLoadingStats] = useState(false);

  // State - Distribution / Repescagem
  const [distributionMode, setDistributionMode] = useState<"stock" | "transfer">("stock");
  const [selectedConsultantId, setSelectedConsultantId] = useState<string>(""); // Destination
  const [fromConsultantId, setFromConsultantId] = useState<string>(""); // Source (for repescagem)
  const [quantity, setQuantity] = useState<number>(10);
  const [distributing, setDistributing] = useState(false);
  const [distribMsg, setDistribMsg] = useState("");

  // State - Create Campaign
  const [newCampName, setNewCampName] = useState("");
  const [newCampDesc, setNewCampDesc] = useState("");
  const [newCampGN, setNewCampGN] = useState("");
  const [newCampGS, setNewCampGS] = useState("");
  const [newCampOwner, setNewCampOwner] = useState("");
  const [campaignFile, setCampaignFile] = useState<File | null>(null);
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState("");

  // Role Lists for Selectors
  const [usersGS, setUsersGS] = useState<User[]>([]);
  const [usersGN, setUsersGN] = useState<User[]>([]);
  const [usersOwner, setUsersOwner] = useState<User[]>([]);

  useEffect(() => {
    if (status === "authenticated" && session?.user.role === "CONSULTOR") {
      router.replace("/board");
    }
  }, [status, session, router]);

  useEffect(() => {
    loadInfo();
  }, [selectedCampaignId]); // Added selectedCampaignId as it triggers stats load in other effect? No, loadInfo loads summaries.
  // Actually, loadInfo uses no props/state. But eslint wants it.
  // Wait, I should make loadInfo a useCallback or move it inside useEffect.
  // Or just silence the warning if I know better, but better to fix.

  useEffect(() => {
    if (selectedCampaignId) {
      loadCampaignDetails(selectedCampaignId);
    }
  }, [selectedCampaignId]);

  async function loadInfo() {
    // Load Campaigns Summary
    // Load Users for Filters
    const [campRes, userRes] = await Promise.all([
      fetch("/api/campanhas/summary", { cache: "no-store" }),
      fetch("/api/admin/users", { cache: "no-store" })
    ]);

    if (campRes.ok) {
      const data = await campRes.json();
      setCampaigns(data);
      if (data.length > 0 && !selectedCampaignId) setSelectedCampaignId(data[0].id);
    }

    if (userRes.ok) {
      const allUsers: User[] = await userRes.json();
      setAllConsultants(allUsers.filter(u => u.role === "CONSULTOR"));
      setUsersGS(allUsers.filter(u => u.role === "GERENTE_SENIOR" || u.role === "MASTER"));
      setUsersGN(allUsers.filter(u => u.role === "GERENTE_NEGOCIOS" || u.role === "MASTER"));
      setUsersOwner(allUsers.filter(u => u.role === "PROPRIETARIO" || u.role === "MASTER"));
    }
  }

  async function loadCampaignDetails(id: string) {
    setLoadingStats(true);
    try {
      const res = await fetch(`/api/campanhas/${id}/consultants`);
      if (res.ok) {
        setConsultantsStats(await res.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingStats(false);
    }
  }

  async function handleCreateCampaign(e: React.FormEvent) {
    e.preventDefault();
    if (!campaignFile || !newCampName) {
      setCreateMsg("Preencha nome e selecione um arquivo.");
      return;
    }
    setCreating(true);
    setCreateMsg("");

    try {
      const formData = new FormData();
      formData.append("nome", newCampName);
      formData.append("descricao", newCampDesc);
      formData.append("gnId", newCampGN);
      formData.append("gsId", newCampGS);
      formData.append("ownerId", newCampOwner);
      formData.append("file", campaignFile);

      const res = await fetch("/api/campanhas", {
        method: "POST",
        body: formData
      });

      if (res.ok) {
        const data = await res.json();
        setCreateMsg(`Campanha criada com sucesso! ${data.importedCount} leads importados.`);
        setNewCampName("");
        setCampaignFile(null);
        // Refresh Dashboard
        loadInfo();
        setActiveTab("dashboard");
      } else {
        setCreateMsg("Erro ao criar campanha.");
      }
    } catch {
      setCreateMsg("Erro no servidor.");
    } finally {
      setCreating(false);
    }
  }

  async function handleDistribution() {
    setDistributing(true);
    setDistribMsg("");

    try {
      const endpoint = distributionMode === "transfer"
        ? "/api/campanhas/repescagem"
        : "/api/campanhas/distribuir";

      const body: Record<string, unknown> = {
        campanhaId: selectedCampaignId,
        quantity: quantity
      };

      if (distributionMode === "stock") {
        body.consultorId = selectedConsultantId;
      } else {
        body.fromConsultantId = fromConsultantId;
        body.toConsultantId = selectedConsultantId;
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      if (res.ok) {
        const data = await res.json();
        setDistribMsg(`Sucesso! ${data.transferred || data.assigned || 'Leads'} processados.`);
        loadCampaignDetails(selectedCampaignId);
        loadInfo();
      } else {
        setDistribMsg("Erro na distribuição.");
      }
    } catch {
      setDistribMsg("Erro de conexão.");
    } finally {
      setDistributing(false);
    }
  }

  const selectedCampaign = campaigns.find(c => c.id === selectedCampaignId);

  return (
    <div className="space-y-8 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-neon-pink mb-1">Admin</p>
          <h1 className="text-3xl font-black text-white uppercase tracking-tighter">Gestão de Campanhas e Leads</h1>
        </div>
        <div className="flex gap-2 bg-pic-dark/50 p-1 rounded-lg border border-white/10">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`px-4 py-2 text-sm font-bold uppercase tracking-wider rounded transition-all ${activeTab === "dashboard" ? "bg-neon-blue text-black shadow-[0_0_15px_rgba(0,243,255,0.4)]" : "text-slate-400 hover:text-white"}`}
          >
            <BarChart3 className="w-4 h-4 inline-block mr-2" />
            Gestão
          </button>
          <button
            onClick={() => setActiveTab("create")}
            className={`px-4 py-2 text-sm font-bold uppercase tracking-wider rounded transition-all ${activeTab === "create" ? "bg-neon-pink text-black shadow-[0_0_15px_rgba(255,0,153,0.4)]" : "text-slate-400 hover:text-white"}`}
          >
            <Plus className="w-4 h-4 inline-block mr-2" />
            Nova Campanha
          </button>
        </div>
      </div>

      {/* DASHBOARD TAB */}
      {activeTab === "dashboard" && (
        <div className="space-y-6">
          {/* Campaign Selector */}
          <div className="bg-pic-card border border-white/10 p-4 rounded-xl flex flex-col md:flex-row gap-4 items-center">
            <label className="text-sm font-bold text-slate-400 uppercase">Campanha Ativa:</label>
            <select
              value={selectedCampaignId}
              onChange={(e) => setSelectedCampaignId(e.target.value)}
              className="flex-1 bg-black/30 border border-white/20 text-white rounded-lg px-4 py-3 focus:border-neon-blue outline-none"
            >
              {campaigns.map(c => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
            <div className="flex gap-4 text-sm font-mono text-slate-400">
              <div>Total: <span className="text-white">{selectedCampaign?.totalLeads || 0}</span></div>
              <div>Disp: <span className="text-neon-green">{selectedCampaign?.remainingLeads || 0}</span></div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column: Distribution Actions */}
            <div className="space-y-6">
              <div className="bg-pic-card border border-white/10 rounded-xl p-6 space-y-6">
                <h3 className="text-lg font-bold text-white uppercase flex items-center gap-2">
                  <RefreshCw className="w-5 h-5 text-neon-yellow" />
                  Distribuição & Repescagem
                </h3>

                <div className="flex gap-2 border-b border-white/10 pb-4">
                  <button
                    onClick={() => setDistributionMode("stock")}
                    className={`flex-1 py-2 text-xs font-bold uppercase rounded ${distributionMode === "stock" ? "bg-white/10 text-white" : "text-slate-500 hover:text-slate-300"}`}
                  >
                    Do Estoque
                  </button>
                  <button
                    onClick={() => setDistributionMode("transfer")}
                    className={`flex-1 py-2 text-xs font-bold uppercase rounded ${distributionMode === "transfer" ? "bg-white/10 text-white" : "text-slate-500 hover:text-slate-300"}`}
                  >
                    Repescagem (Transf.)
                  </button>
                </div>

                <div className="space-y-4">
                  {distributionMode === "transfer" && (
                    <div>
                      <label className="text-xs text-neon-pink font-bold uppercase block mb-2">Origem (Retirar de)</label>
                      <select
                        value={fromConsultantId}
                        onChange={(e) => setFromConsultantId(e.target.value)}
                        className="w-full bg-black/30 border border-white/20 rounded px-3 py-2 text-white text-sm"
                      >
                        <option value="">Selecione Consultor...</option>
                        {consultantsStats.map(c => (
                          <option key={c.id} value={c.id}>{c.name} ({c.workedLeads} leads)</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="text-xs text-neon-green font-bold uppercase block mb-2">Destino (Enviar para)</label>
                    <select
                      value={selectedConsultantId}
                      onChange={(e) => setSelectedConsultantId(e.target.value)}
                      className="w-full bg-black/30 border border-white/20 rounded px-3 py-2 text-white text-sm"
                    >
                      <option value="">Selecione Consultor...</option>
                      {allConsultants.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs text-slate-400 font-bold uppercase block mb-2">Quantidade</label>
                    <input
                      type="number"
                      min="1"
                      value={quantity}
                      onChange={(e) => setQuantity(Number(e.target.value))}
                      className="w-full bg-black/30 border border-white/20 rounded px-3 py-2 text-white text-sm"
                    />
                  </div>

                  {distribMsg && (
                    <div className="p-3 bg-white/5 border border-white/10 text-xs text-center rounded text-neon-yellow">
                      {distribMsg}
                    </div>
                  )}

                  <button
                    onClick={handleDistribution}
                    disabled={distributing}
                    className="w-full py-3 bg-neon-blue text-black font-black uppercase tracking-widest hover:bg-white transition-all disabled:opacity-50"
                  >
                    {distributing ? "Processando..." : "Executar"}
                  </button>
                </div>
              </div>
            </div>

            {/* Right Column: Consultants Table */}
            <div className="lg:col-span-2">
              <div className="bg-pic-card border border-white/10 rounded-xl overflow-hidden">
                <div className="p-6 border-b border-white/10">
                  <h3 className="text-lg font-bold text-white uppercase flex items-center gap-2">
                    <Users className="w-5 h-5 text-neon-blue" />
                    Performance na Campanha
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-black/30 text-slate-400 font-mono uppercase text-xs">
                      <tr>
                        <th className="px-6 py-3">Consultor</th>
                        <th className="px-6 py-3 text-right">Total Leads</th>
                        <th className="px-6 py-3 text-right">Trabalhados</th>
                        <th className="px-6 py-3 text-right">Contatados</th>
                        <th className="px-6 py-3 text-right">Fechados</th>
                        <th className="px-6 py-3 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {loadingStats ? (
                        <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-500">Carregando dados...</td></tr>
                      ) : consultantsStats.map(stat => (
                        <tr key={stat.id} className="hover:bg-white/5 transition-colors group">
                          <td className="px-6 py-4 font-medium text-white">{stat.name}</td>
                          <td className="px-6 py-4 text-right">{stat.totalLeads}</td>
                          <td className="px-6 py-4 text-right text-neon-yellow">{stat.workedLeads}</td>
                          <td className="px-6 py-4 text-right text-neon-blue">{stat.contactedLeads}</td>
                          <td className="px-6 py-4 text-right text-neon-green">{stat.closedLeads}</td>
                          <td className="px-6 py-4 text-right">
                            <button
                              className="text-xs bg-white/10 hover:bg-white/20 text-white px-2 py-1 rounded"
                              onClick={() => {
                                setDistributionMode("transfer");
                                setFromConsultantId(stat.id);
                              }}
                            >
                              Repescar
                            </button>
                          </td>
                        </tr>
                      ))}
                      {consultantsStats.length === 0 && !loadingStats && (
                        <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-500">Nenhum consultor com leads nesta campanha.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CREATE CAMPAIGN TAB */}
      {activeTab === "create" && (
        <div className="max-w-2xl mx-auto bg-pic-card border border-white/10 rounded-xl p-8 space-y-8">
          <div>
            <h2 className="text-2xl font-black text-white uppercase mb-2">Nova Campanha</h2>
            <p className="text-slate-400 text-sm">Crie uma nova campanha e importe sua base de leads.</p>
          </div>

          <form onSubmit={handleCreateCampaign} className="space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase text-neon-blue">Nome da Campanha</label>
              <input
                className="w-full bg-black/30 border border-white/20 rounded-lg px-4 py-3 text-white focus:border-neon-blue outline-none"
                placeholder="Ex: Indústrias SP 2024"
                value={newCampName}
                onChange={e => setNewCampName(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase text-slate-500">Gerente de Negócios (GN)</label>
                <select
                  className="w-full bg-black/30 border border-white/20 rounded-lg px-3 py-3 text-white focus:border-neon-blue outline-none text-sm"
                  value={newCampGN}
                  onChange={e => setNewCampGN(e.target.value)}
                >
                  <option value="">Selecione...</option>
                  {usersGN.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase text-slate-500">Gerente Sênior (GS)</label>
                <select
                  className="w-full bg-black/30 border border-white/20 rounded-lg px-3 py-3 text-white focus:border-neon-blue outline-none text-sm"
                  value={newCampGS}
                  onChange={e => setNewCampGS(e.target.value)}
                >
                  <option value="">Selecione...</option>
                  {usersGS.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
            </div>

            {/* File Upload Area */}
            <div className="border-2 border-dashed border-white/10 rounded-xl p-8 text-center hover:border-neon-pink/50 transition-colors group cursor-pointer relative">
              <input
                type="file"
                accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={e => setCampaignFile(e.target.files?.[0] || null)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <div className="flex flex-col items-center gap-2 pointer-events-none">
                <FileSpreadsheet className={`w-10 h-10 ${campaignFile ? "text-neon-green" : "text-slate-500 group-hover:text-neon-pink"}`} />
                <p className="text-sm font-bold text-white uppercase">
                  {campaignFile ? campaignFile.name : "Arraste sua base ou clique"}
                </p>
                <p className="text-xs text-slate-500">Suporta .xlsx e .csv</p>
              </div>
            </div>

            {createMsg && (
              <div className={`p-4 rounded border text-sm text-center ${createMsg.includes("sucesso") ? "bg-neon-green/10 border-neon-green text-neon-green" : "bg-red-500/10 border-red-500 text-red-500"}`}>
                {createMsg}
              </div>
            )}

            <div className="flex gap-4 pt-4">
              <button
                type="button"
                onClick={() => setActiveTab("dashboard")}
                className="px-6 py-3 rounded-lg border border-white/10 text-slate-400 hover:text-white font-bold uppercase text-sm"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={creating}
                className="flex-1 px-6 py-3 rounded-lg bg-neon-green text-black font-black uppercase tracking-widest hover:bg-white hover:shadow-[0_0_20px_rgba(204,255,0,0.4)] transition-all disabled:opacity-50"
              >
                {creating ? "Criando..." : "Criar Campanha"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
