import React, { useEffect, useState, useCallback } from "react";
import { LeadCardProps } from "./LeadCard";

type LeadDetail = LeadCardProps["lead"] & {
  emails?: string[];
  telefones?: { rotulo: string; valor: string; feedback?: "like" | "dislike" | null }[];
  vertical?: string | null;
  cidade?: string | null;
  estado?: string | null;
  endereco?: string | null;
  origem?: string | null;
  site?: string | null;
  contatoPrincipal?: { nome?: string; cargo?: string; telefone?: string; email?: string } | null;
  externalData?: Record<string, unknown> | null;
  cnpj?: string | null;
  razaoSocial?: string | null;
  nomeFantasia?: string | null;
  vlFatPresumido?: string | null;
};

import { LeadStatusId, LEAD_STATUS } from "@/constants/leadStatus";
import { PRODUCT_CATALOG } from "@/lib/productCatalog";
import { PhoneItem } from "./PhoneItem";
import { CompanyEnrichmentCard } from "./CompanyEnrichmentCard";

type LeadProduct = {
  productId: string;
  tower: string;
  category: string;
  name: string;
  quantity: number;
  monthlyValue?: number | null;
  note?: string | null;
};

type LeadActivity = {
  id: string;
  activityType: string;
  channel?: string | null;
  outcomeCode?: string | null;
  outcomeLabel?: string | null;
  note: string;
  stageBefore?: string | null;
  stageAfter?: string | null;
  nextFollowUpAt?: string | null;
  nextStepNote?: string | null;
  createdAt: string;
  user?: { id: string; name?: string | null; email?: string | null };
};

type LeadLoss = {
  id: string;
  motivo: string;
  justificativa: string;
  createdAt: string;
  user?: { name?: string; email?: string };
};

const ACTIVITY_TYPES = [
  "Contato inicial",
  "Retorno de ligação",
  "Follow-up",
  "Qualificação",
  "Proposta enviada",
  "Negociação",
  "Outros",
] as const;

const CHANNEL_OPTIONS = [
  { value: "TELEFONE", label: "Telefone" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "EMAIL", label: "E-mail" },
  { value: "VISITA", label: "Visita" },
  { value: "OUTRO", label: "Outro" },
];

const OUTCOME_OPTIONS = [
  { code: "SEM_CONTATO", label: "Não conseguiu contato" },
  { code: "NUMERO_INVALIDO", label: "Número inválido / errado" },
  { code: "FALOU_SECRETARIA", label: "Falou com secretária / terceiro" },
  { code: "CLIENTE_SEM_INTERESSE", label: "Cliente sem interesse" },
  { code: "SEM_ORCAMENTO", label: "Sem orçamento no momento" },
  { code: "SEM_PERFIL", label: "Cliente sem perfil" },
  { code: "JA_ATENDE_OUTRO_FORNECEDOR", label: "Já atende com outro fornecedor" },
  { code: "FECHOU_COM_CONCORRENTE", label: "Fechou com concorrente" },
  { code: "VAI_AVALIAR_RETORNAR", label: "Vai avaliar e retornar" },
  { code: "OUTRO", label: "Outro (descrever)" },
];

type Props = {
  lead: LeadDetail;
  onClose: () => void;
  onRefresh: () => Promise<void>;
};

const lossMotivos = [
  "Não tem interesse",
  "Já possui solução",
  "Sem orçamento",
  "Não atende / Contato impossível",
  "Número inexistente",
  "Cliente fora do perfil",
  "Empresa não encontrada",
  "Em negociação com concorrente",
  "Encerrado por duplicidade",
  "Outro",
] as const;

export function LeadDetailModal({ lead, onClose, onRefresh }: Props) {
  const [tab, setTab] = useState<"dados" | "atividades" | "produtos" | "perda" | "externo">("dados");
  // Activity / Notes State
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [activityForm, setActivityForm] = useState({
    type: ACTIVITY_TYPES[0] as string,
    channel: CHANNEL_OPTIONS[0].value,
    outcome: "",
    note: "",
    nextFollowUp: "",
  });
  const [savingActivity, setSavingActivity] = useState(false);

  // Products State
  const [products, setProducts] = useState<LeadProduct[]>([]);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [savingProducts, setSavingProducts] = useState(false);

  const [losses, setLosses] = useState<LeadLoss[]>([]);
  const [lossMotivo, setLossMotivo] = useState<string>(lossMotivos[0]);
  const [lossJust, setLossJust] = useState("");
  const [savingLoss, setSavingLoss] = useState(false);
  const [externalLoading, setExternalLoading] = useState(false);
  const [externalData, setExternalData] = useState<Record<string, unknown> | null>(lead.externalData ?? null);

  // Status Editing
  const [selectedStatus, setSelectedStatus] = useState(lead.status);
  const [statusDirty, setStatusDirty] = useState(false);

  const [phonesState, setPhonesState] = useState(
    [
      ...(lead.telefones ?? []),
      ...[lead.telefone1, lead.telefone2, lead.telefone3]
        .filter(Boolean)
        .map((p) => ({ rotulo: "Telefone", valor: p as string })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ].map(p => ({ ...p, feedback: (p as any).feedback ?? null }))
  );

  const loadActivities = useCallback(async () => {
    const res = await fetch(`/api/activities?leadId=${lead.id}`, { cache: "no-store" });
    if (res.ok) setActivities(await res.json());
  }, [lead.id]);

  const loadProducts = useCallback(async () => {
    const res = await fetch(`/api/leads/${lead.id}/products`, { cache: "no-store" });
    if (res.ok) setProducts(await res.json());
  }, [lead.id]);

  const loadLosses = useCallback(async () => {
    const res = await fetch(`/api/lead-losses?leadId=${lead.id}`, { cache: "no-store" });
    if (res.ok) setLosses(await res.json());
  }, [lead.id]);

  useEffect(() => {
    loadActivities();
    loadProducts();
    loadLosses();
  }, [lead.id, loadLosses, loadActivities, loadProducts]);

  async function saveActivity() {
    if (!activityForm.note.trim()) return;
    setSavingActivity(true);
    await fetch("/api/activities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leadId: lead.id,
        activityType: activityForm.type,
        channel: activityForm.channel,
        outcomeCode: activityForm.outcome,
        outcomeLabel: OUTCOME_OPTIONS.find(o => o.code === activityForm.outcome)?.label,
        note: activityForm.note,
        nextFollowUpAt: activityForm.nextFollowUp ? new Date(activityForm.nextFollowUp).toISOString() : null,
      }),
    });
    setActivityForm(prev => ({ ...prev, note: "", outcome: "" }));
    setSavingActivity(false);
    await loadActivities();
    await onRefresh();
  }

  async function saveProducts(newProducts: LeadProduct[]) {
    setSavingProducts(true);
    await fetch(`/api/leads/${lead.id}/products`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ products: newProducts }),
    });
    setProducts(newProducts);
    setSavingProducts(false);
    await onRefresh();
  }

  async function handleStatusSave() {
    if (selectedStatus === "PERDIDO" && !lossMotivo) {
      setTab("perda");
      return;
    }
    await fetch(`/api/leads/${lead.id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: selectedStatus }),
    });
    setStatusDirty(false);
    await onRefresh();
  }

  async function saveLoss() {
    if (!lossJust.trim()) return;
    setSavingLoss(true);
    await fetch("/api/lead-losses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId: lead.id, motivo: lossMotivo, justificativa: lossJust }),
    });
    setSavingLoss(false);
    setLossJust("");
    await loadLosses();
    await onRefresh();
  }

  async function runEnrichment() {
    setExternalLoading(true);
    // Adicionando tratamento de erro básico no catch do fetch wrapper se necessário, mas aqui tratamos no UI
    const res = await fetch(`/api/leads/enrich?cnpj=${lead.cnpj ?? ""}&id=${lead.id}`, { method: "POST" });
    setExternalLoading(false);
    if (res.ok) {
      const data = await res.json();
      setExternalData(data);
    } else {
      // Opcional: Notificar erro visualmente, hoje o card já trata estado null/loading
      console.error("Erro enriquecimento", res.status);
    }
  }

  async function handlePhoneFeedback(valor: string, feedback: "like" | "dislike" | null) {
    const newPhones = phonesState.map(p => p.valor === valor ? { ...p, feedback } : p);
    setPhonesState(newPhones);

    // Save immediately
    await fetch(`/api/leads/${lead.id}/telefones`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telefones: newPhones })
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
      <div className="relative w-full max-w-5xl bg-pic-dark h-full max-h-[90vh] overflow-y-auto border-4 border-neon-pink shadow-[0_0_40px_rgba(255,0,153,0.3)] flex flex-col">
        {/* Header Section */}
        <div className="p-8 border-b border-dashed border-slate-700 relative">
          <div className="flex justify-between items-start mb-6">
            <div className="inline-block bg-neon-green text-black px-2 py-1 text-xs font-black uppercase tracking-widest mb-4">
              Lead Details
            </div>
            <button
              onClick={onClose}
              className="border-2 border-white text-white w-8 h-8 flex items-center justify-center hover:bg-white hover:text-black font-bold text-lg transition-colors"
            >
              X
            </button>
          </div>


          <h2 className="text-4xl font-black text-white uppercase tracking-tight mb-2">
            {lead.nomeFantasia ?? lead.razaoSocial ?? "SEM NOME"}
          </h2>
          <p className="text-slate-400 font-mono text-sm">
            {lead.vertical ?? "Indústria"} / {lead.cidade ?? "Brasil"} <span className="text-neon-pink ml-2">CNPJ: {lead.cnpj ?? "Não informado"}</span>
          </p>
          <div className="w-full border-b border-dashed border-slate-700 my-6 opacity-30"></div>

          {/* Top Cards: Termometro & Campanha */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            <div className="border border-slate-700 bg-pic-card p-4">
              <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">Status Atual</p>
              <p className="text-xl font-bold text-neon-green uppercase">
                {LEAD_STATUS.find((s) => s.id === lead.status)?.title ?? lead.status}
              </p>
            </div>
            <div className="border border-slate-700 bg-pic-card p-4">
              <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">Campanha</p>
              <p className="text-lg font-bold text-white font-mono leading-tight">
                {lead.campanha?.nome ?? "Nenhuma campanha ativa"}
              </p>
            </div>
          </div>

          {/* Action Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
            <div className="space-y-2">
              <label className="text-xs font-bold text-neon-blue uppercase tracking-widest text-cyan-400">Estágio</label>
              <div className="relative">
                <select
                  className="w-full bg-pic-dark border-2 border-cyan-400 text-white px-4 py-3 appearance-none font-bold uppercase tracking-wider focus:shadow-[0_0_15px_rgba(0,240,255,0.3)] transition-shadow outline-none"
                  value={selectedStatus}
                  onChange={(e) => {
                    setSelectedStatus(e.target.value as LeadStatusId);
                    setStatusDirty(e.target.value !== lead.status);
                  }}
                >
                  {LEAD_STATUS.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-cyan-400 pointer-events-none">▼</div>
              </div>
            </div>

            <button
              onClick={handleStatusSave}
              disabled={!statusDirty}
              className={`w-full font-black uppercase py-3.5 tracking-widest transition-all shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] ${statusDirty
                ? "bg-neon-pink text-white hover:bg-pink-600 hover:shadow-[4px_4px_0px_0px_rgba(255,0,153,0.5)]"
                : "bg-slate-700 text-slate-400 cursor-not-allowed"
                }`}
            >
              {statusDirty ? "Salvar Alterações" : "Sem Alterações"}
            </button>
          </div>
        </div>

        {/* Content Tabs area */}
        <div className="p-8 pt-0 flex-1">
          {/* Custom Tab Navigation that looks brutalist */}
          <div className="flex flex-wrap gap-4 mb-6 border-b border-slate-800 pb-1">
            {[
              { id: "dados", label: "Dados Básicos" },
              { id: "atividades", label: "Atividades & Timeline" },
              { id: "produtos", label: "Planta Vivo" },
              { id: "perda", label: "Registrar Perda" },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id as "dados" | "atividades" | "produtos" | "perda" | "externo")}
                className={`uppercase tracking-widest font-bold text-sm pb-2 border-b-2 transition-colors ${tab === t.id ? "text-neon-green border-neon-green" : "text-slate-600 border-transparent hover:text-slate-400"
                  }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab Content Styled Brutalist */}
          {tab === "dados" && (
            <div className="space-y-6">
              <div className="border-l-4 border-neon-green pl-4">
                <h3 className="text-xl font-bold text-white uppercase tracking-wider mb-4">Dados da Empresa</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase text-slate-500 tracking-widest">Razão Social</label>
                    <div className="bg-black border border-slate-800 p-3 text-white font-mono text-sm">
                      {lead.razaoSocial ?? "-"}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase text-slate-500 tracking-widest">Documento</label>
                    <div className="bg-black border border-slate-800 p-3 text-white font-mono text-sm">
                      {lead.cnpj ?? "-"}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase text-slate-500 tracking-widest">Cidade / UF</label>
                    <div className="bg-black border border-slate-800 p-3 text-white font-mono text-sm">
                      {lead.cidade ?? "-"} / {lead.estado ?? "-"}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase text-slate-500 tracking-widest mb-2 block">Telefones & Feedback</label>
                    <div className="space-y-2">
                      {phonesState.length > 0 ? (
                        phonesState.map((p, i) => (
                          <PhoneItem
                            key={i}
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            phone={p as any}
                            onFeedback={handlePhoneFeedback}
                          />
                        ))
                      ) : (
                        <p className="text-slate-600 text-xs italic">Sem telefones cadastrados.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Enrichment Section */}
              <div className="border-l-4 border-neon-blue pl-4 pt-2">
                <CompanyEnrichmentCard
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  data={externalData as any}
                  loading={externalLoading}
                  onEnrich={runEnrichment}
                  companyName={lead.razaoSocial ?? lead.nomeFantasia ?? ""}
                  city={lead.cidade ?? ""}
                />
              </div>
            </div>
          )}

          {tab === "atividades" && (
            <div className="space-y-6">
              {/* Activity Form */}
              <div className="bg-pic-card border border-2 border-slate-700 p-5 shadow-lg">
                <p className="text-xs font-bold uppercase text-slate-400 tracking-widest mb-4">Nova Atividade</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <select
                    value={activityForm.type}
                    onChange={e => setActivityForm(p => ({ ...p, type: e.target.value }))}
                    className="bg-black border border-slate-600 text-white text-sm p-3 focus:border-neon-pink outline-none"
                  >
                    {ACTIVITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <select
                    value={activityForm.channel}
                    onChange={e => setActivityForm(p => ({ ...p, channel: e.target.value }))}
                    className="bg-black border border-slate-600 text-white text-sm p-3 focus:border-neon-pink outline-none"
                  >
                    {CHANNEL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <select
                    value={activityForm.outcome}
                    onChange={e => setActivityForm(p => ({ ...p, outcome: e.target.value }))}
                    className="bg-black border border-slate-600 text-white text-sm p-3 focus:border-neon-pink outline-none"
                  >
                    <option value="">Selecione Resultado...</option>
                    {OUTCOME_OPTIONS.map(o => <option key={o.code} value={o.code}>{o.label}</option>)}
                  </select>
                  <input
                    type="datetime-local"
                    value={activityForm.nextFollowUp}
                    onChange={e => setActivityForm(p => ({ ...p, nextFollowUp: e.target.value }))}
                    className="bg-black border border-slate-600 text-white text-sm p-3 focus:border-neon-pink outline-none placeholder-slate-500"
                  />
                </div>
                <textarea
                  value={activityForm.note}
                  onChange={e => setActivityForm(p => ({ ...p, note: e.target.value }))}
                  className="w-full bg-black border border-slate-600 text-white text-sm p-3 font-mono focus:border-neon-pink outline-none mb-4"
                  rows={3}
                  placeholder="Descreva a interação..."
                />
                <div className="flex justify-end">
                  <button
                    onClick={saveActivity}
                    disabled={savingActivity}
                    className="bg-white text-black font-black uppercase text-xs px-6 py-3 hover:bg-neon-pink hover:text-white transition-colors"
                  >
                    {savingActivity ? "Salvando..." : "Registrar Atividade"}
                  </button>
                </div>
              </div>

              {/* Timeline */}
              <div className="space-y-4 max-h-[400px] overflow-auto pr-2 custom-scrollbar">
                {activities.map(a => (
                  <div key={a.id} className="relative border-l-2 border-slate-700 bg-pic-card/50 p-4 ml-2 hover:border-neon-pink transition-colors">
                    <div className="absolute -left-[9px] top-4 w-4 h-4 rounded-full bg-pic-dark border-2 border-slate-500"></div>
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <span className="text-neon-green font-bold text-xs uppercase tracking-wider mr-2">{a.activityType}</span>
                        <span className="text-slate-500 text-[10px] uppercase tracking-widest">{new Date(a.createdAt).toLocaleString()}</span>
                      </div>
                      {a.user && <span className="text-xs text-slate-600 uppercase">{a.user.name}</span>}
                    </div>
                    <p className="text-slate-300 font-mono text-sm leading-relaxed">{a.note}</p>
                    {a.nextFollowUpAt && (
                      <div className="mt-2 inline-flex items-center gap-2 bg-slate-800/50 px-2 py-1 rounded">
                        <span className="text-xs text-amber-500">📅 Follow-up: {new Date(a.nextFollowUpAt).toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "produtos" && (
            <div className="space-y-6">
              <div className="bg-pic-card border border-dashed border-slate-700 p-4 flex justify-between items-center">
                <div>
                  <h4 className="text-white font-bold uppercase">Produtos no Carrinho</h4>
                  <p className="text-xs text-slate-500">Total de itens: {products.reduce((acc, p) => acc + p.quantity, 0)}</p>
                </div>
                <button
                  onClick={() => setCatalogOpen(!catalogOpen)}
                  className="border border-neon-green text-neon-green px-4 py-2 text-xs font-bold uppercase hover:bg-neon-green hover:text-black transition-colors"
                >
                  {catalogOpen ? "Fechar Catálogo" : "+ Adicionar Produtos"}
                </button>
              </div>

              {catalogOpen && (
                <div className="bg-black border border-slate-800 p-4 grid grid-cols-1 md:grid-cols-2 gap-2 animate-in slide-in-from-top-2">
                  {PRODUCT_CATALOG.slice(0, 10).map(p => (
                    <div key={p.id} className="flex justify-between items-center bg-pic-zinc p-2 border border-transparent hover:border-neon-blue cursor-pointer"
                      onClick={() => {
                        const exists = products.find(x => x.productId === p.id);
                        let newProducts;
                        if (exists) {
                          newProducts = products.map(x => x.productId === p.id ? { ...x, quantity: x.quantity + 1 } : x);
                        } else {
                          newProducts = [...products, {
                            productId: p.id, tower: p.tower, category: p.category, name: p.name, quantity: 1, monthlyValue: 0
                          }];
                        }
                        setProducts(newProducts);
                      }}
                    >
                      <span className="text-xs text-slate-300 font-mono trim">{p.name}</span>
                      <span className="text-[10px] text-neon-blue uppercase border border-neon-blue/30 px-1">+ Add</span>
                    </div>
                  ))}
                  <div className="col-span-full text-center text-xs text-slate-500 pt-2">Exibindo top 10 produtos...</div>
                </div>
              )}

              <div className="space-y-2">
                {products.map((p, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-pic-zinc p-3 border-l-4 border-neon-blue">
                    <div>
                      <p className="text-sm font-bold text-white">{p.name}</p>
                      <p className="text-xs text-slate-500">{p.tower} • {p.category}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center bg-black border border-slate-700">
                        <button className="px-2 text-slate-400 hover:text-white" onClick={() => {
                          const update = products.map(x => x.productId === p.productId ? { ...x, quantity: Math.max(0, x.quantity - 1) } : x).filter(x => x.quantity > 0);
                          setProducts(update);
                        }}>-</button>
                        <span className="text-xs font-mono w-8 text-center">{p.quantity}</span>
                        <button className="px-2 text-slate-400 hover:text-white" onClick={() => {
                          const update = products.map(x => x.productId === p.productId ? { ...x, quantity: x.quantity + 1 } : x);
                          setProducts(update);
                        }}>+</button>
                      </div>
                      <button onClick={() => setProducts(products.filter(x => x.productId !== p.productId))} className="text-red-500 text-xs font-bold uppercase hover:underline">Remover</button>
                    </div>
                  </div>
                ))}
                {products.length === 0 && (
                  <div className="text-center py-8 border-2 border-dashed border-slate-800 rounded">
                    <p className="text-slate-600 font-mono text-sm">Carrinho vazio</p>
                  </div>
                )}
              </div>

              {products.length > 0 && (
                <div className="flex justify-end">
                  <button
                    onClick={() => saveProducts(products)}
                    disabled={savingProducts}
                    className="bg-neon-blue text-black font-black uppercase text-sm px-6 py-3 hover:bg-cyan-400 shadow-[4px_4px_0px_0px_rgba(0,240,255,0.4)]"
                  >
                    {savingProducts ? "Salvando..." : "Salvar Planta Vivo"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Implement other tabs similarly for full completeness if needed, but 'dados' was the main request visually */}
          {tab === "perda" && (
            <div className="py-4 space-y-4">
              <div className="bg-pic-card border border-slate-700 p-4 space-y-4">
                <p className="text-xs uppercase text-slate-500 tracking-widest">Registrar perda</p>
                <select
                  value={lossMotivo}
                  onChange={(e) => setLossMotivo(e.target.value)}
                  className="w-full bg-black text-white border border-slate-700 p-3 text-sm font-mono focus:border-red-500 outline-none"
                >
                  {lossMotivos.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <textarea
                  value={lossJust}
                  onChange={(e) => setLossJust(e.target.value)}
                  className="w-full bg-black text-white border border-slate-700 p-3 text-sm font-mono focus:border-red-500 outline-none"
                  rows={3}
                  placeholder="Justifique a perda"
                  required
                />
                <button
                  onClick={saveLoss}
                  disabled={savingLoss}
                  className="w-full bg-red-600 text-white px-4 py-2 text-sm font-black uppercase hover:bg-red-500 disabled:opacity-60 tracking-wider shadow-[4px_4px_0px_0px_rgba(255,0,0,0.3)]"
                >
                  {savingLoss ? "Salvando..." : "Marcar como perdido"}
                </button>
              </div>
              <div className="space-y-3">
                {losses.map((l) => (
                  <div key={l.id} className="border-l-4 border-red-600 bg-pic-card p-3 shadow-sm">
                    <div className="flex justify-between text-[10px] uppercase text-slate-500 mb-1">
                      <span>{l.motivo}</span>
                      <span>
                        {l.user?.name ?? l.user?.email ?? "Usuário"} •{" "}
                        {new Date(l.createdAt).toLocaleString("pt-BR")}
                      </span>
                    </div>
                    <p className="text-sm text-slate-300 mt-1 font-mono whitespace-pre-wrap">{l.justificativa}</p>
                  </div>
                ))}
                {losses.length === 0 ? <p className="text-sm text-slate-600 font-mono">Nenhum registro de perda.</p> : null}
              </div>
            </div>
          )}


        </div>
      </div>
    </div>
  );
}
