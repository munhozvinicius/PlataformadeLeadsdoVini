import React, { useEffect, useState, useCallback } from "react";
import { LeadCardProps } from "./LeadCard";
import { Activity, Clock } from "lucide-react";

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
  externaData?: Record<string, unknown> | null;
  cnpj?: string | null;
  razaoSocial?: string | null;
  nomeFantasia?: string | null;
  vlFatPresumido?: string | null;
  numero?: string | null;
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

type ValidContact = {
  name: string;
  role: string;
  phone: string;
  email: string;
  createdAt: string;
};



const ACTIVITY_TYPES = [
  "Contato inicial",
  "Retorno de ligação",
  "Follow-up",
  "Qualificação",
  "Reunião",
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

const InfoItem = ({
  label,
  value,
  treatMissingAsZero = false,
}: {
  label: string;
  value: React.ReactNode;
  treatMissingAsZero?: boolean;
}) => {
  const missing = value === null || value === undefined || value === "";
  const display = missing ? (treatMissingAsZero ? "0" : "-") : value;
  return (
    <div className="space-y-1">
      <p className="text-[10px] text-slate-500">{label}</p>
      <p className={`font-mono font-bold ${missing && treatMissingAsZero ? "text-red-400" : "text-white"}`}>
        {display}
      </p>
    </div>
  );
};

export function LeadDetailModal({ lead, onClose, onRefresh }: Props) {
  const [tab, setTab] = useState<"home" | "tratativa" | "produtos">("home");

  // Activity / Notes State with Unified Status
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [activityForm, setActivityForm] = useState({
    type: ACTIVITY_TYPES[0] as string,
    channel: CHANNEL_OPTIONS[0].value,
    outcome: "",
    note: "",
    nextFollowUp: "",
    stage: lead.status // Unified Stage Change
  });
  const [savingActivity, setSavingActivity] = useState(false);

  // Valid Contacts State
  const [contacts, setContacts] = useState<ValidContact[]>(
    (lead.externalData as { validContacts?: ValidContact[] })?.validContacts || []
  );
  const [newContact, setNewContact] = useState({ name: "", role: "", phone: "", email: "" });
  const [savingContact, setSavingContact] = useState(false);
  const [showContactForm, setShowContactForm] = useState(false);

  // Products State
  const [products, setProducts] = useState<LeadProduct[]>([]);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [savingProducts, setSavingProducts] = useState(false);

  /* Removed unused losses state - unified into activity feed via ActivityType? If needed, restore and display. */
  const [lossMotivo, setLossMotivo] = useState<string>(lossMotivos[0]);
  const [lossJust, setLossJust] = useState("");
  // const [savingLoss, setSavingLoss] = useState(false); // Unused in UI
  const [externalLoading, setExternalLoading] = useState(false);
  const [externalData, setExternalData] = useState<Record<string, unknown> | null>(lead.externalData ?? null);

  const [phonesState, setPhonesState] = useState(
    [
      ...(lead.telefones ?? []),
      ...[lead.telefone1, lead.telefone2, lead.telefone3]
        .filter(Boolean)
        .map((p) => ({ rotulo: "Telefone", valor: p as string })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ].map(p => ({ ...p, feedback: (p as any).feedback ?? null }))
  );

  // Status Management (Missing in original?)
  const [selectedStatus, setSelectedStatus] = useState<LeadStatusId>(lead.status as LeadStatusId);
  const [statusDirty, setStatusDirty] = useState(false);

  async function handleStatusSave() {
    // Validation for lost reasons
    if (selectedStatus === "PERDIDO" && !lossJust) {
      alert("Para status PERDIDO, é obrigatório informar o motivo e justificativa.");
      return;
    }

    // Save Loss Reason if applicable
    if (selectedStatus === "PERDIDO") {
      await fetch("/api/lead-losses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead.id, motivo: lossMotivo, justificativa: lossJust }),
      });
    }

    await fetch(`/api/leads/${lead.id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: selectedStatus }),
    });
    setStatusDirty(false);
    await onRefresh();
  }

  const loadActivities = useCallback(async () => {
    const res = await fetch(`/api/activities?leadId=${lead.id}`, { cache: "no-store" });
    if (res.ok) setActivities(await res.json());
  }, [lead.id]);

  const loadProducts = useCallback(async () => {
    const res = await fetch(`/api/leads/${lead.id}/products`, { cache: "no-store" });
    if (res.ok) setProducts(await res.json());
  }, [lead.id]);

  useEffect(() => {
    loadActivities();
    loadProducts();
  }, [lead.id, loadActivities, loadProducts]);

  async function saveActivity() {
    if (!activityForm.note.trim()) return;
    setSavingActivity(true);

    // 1. Save Activity
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

    // 2. Update Status if changed from original lead status
    // Note: We compare with current payload stage vs lead.status
    if (activityForm.stage && activityForm.stage !== lead.status) {
      await fetch(`/api/leads/${lead.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: activityForm.stage }),
      });
    }

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

  async function saveContact() {
    if (!newContact.name || !newContact.phone) return;
    setSavingContact(true);
    const updatedContacts = [...contacts, { ...newContact, createdAt: new Date().toISOString() }];

    await fetch(`/api/leads/${lead.id}/contacts`, {
      method: 'POST',
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contacts: updatedContacts })
    });

    setContacts(updatedContacts);
    setNewContact({ name: "", role: "", phone: "", email: "" });
    setShowContactForm(false);
    setSavingContact(false);
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

          {/* Action Row Removed */}
        </div>

        {/* Content Tabs area */}
        <div className="p-8 pt-0 flex-1">
          {/* Custom Tab Navigation that looks brutalist */}
          <div className="flex flex-wrap gap-4 mb-6 border-b border-slate-800 pb-1">
            {[
              { id: "home", label: "Home" },
              { id: "tratativa", label: "Tratativa" },
              { id: "produtos", label: "Planta Vivo" },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id as "home" | "tratativa" | "produtos")}
                className={`uppercase tracking-widest font-bold text-sm pb-2 border-b-2 transition-colors ${tab === t.id ? "text-neon-green border-neon-green" : "text-slate-600 border-transparent hover:text-slate-400"
                  }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab Content Styled Brutalist */}
          {tab === "home" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* Left Column: Basic Info & Contacts */}
                <div className="space-y-6">
                  {/* MAPA PARQUE LAYOUT CHECK */}
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {(() => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const raw = ((lead as any).raw ?? {}) as Record<string, unknown>;
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const l: any = lead as any;
                    const isMapaParque = l.type === "MAPA_PARQUE" || l.NR_CNPJ || raw.NR_CNPJ || raw.NM_CLIENTE;
                    if (isMapaParque) {
                      const formatDate = (value: unknown) => {
                        if (!value) return "-";
                        const d = new Date(value as string);
                        return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString("pt-BR");
                      };
                      const mp = {
                        cnpj: l.NR_CNPJ ?? l.cnpj ?? raw.NR_CNPJ ?? raw.CNPJ ?? null,
                        nome: l.NM_CLIENTE ?? l.razaoSocial ?? raw.NM_CLIENTE ?? raw.CLIENTE ?? null,
                        endereco: l.DS_ENDERECO ?? l.logradouro ?? raw.DS_ENDERECO ?? null,
                        cidade: l.DS_CIDADE ?? l.cidade ?? raw.DS_CIDADE ?? null,
                        cep: l.NR_CEP ?? l.cep ?? raw.NR_CEP ?? null,
                        numero: l.NUMERO_MP ?? l.numero ?? raw.NUMERO_MP ?? raw.NUMERO ?? null,
                        vertical: l.VERTICAL_MP ?? l.vertical ?? raw.VERTICAL ?? null,
                        qtdSfaFiliais: l.QTD_SFA_FILIAIS ?? raw.QTD_SFA_FILIAIS ?? null,
                        flgCliBiometrado: l.FLG_CLI_BIOMETRADO ?? raw.FLG_CLI_BIOMETRADO ?? null,
                        nomeRede: l.NOMEREDE ?? raw.NOMEREDE ?? null,
                        // Contatos
                        nmContatoSfa: l.NM_CONTATO_SFA ?? raw.NM_CONTATO_SFA ?? null,
                        emailContatoSfa: l.EMAIL_CONTATO_PRINCIPAL_SFA ?? raw.EMAIL_CONTATO_PRINCIPAL_SFA ?? null,
                        celularContatoSfa: l.CELULAR_CONTATO_PRINCIPAL_SFA ?? raw.CELULAR_CONTATO_PRINCIPAL_SFA ?? null,
                        tlfn1: l.TLFN_1 ?? raw.TLFN_1 ?? null,
                        tlfn2: l.TLFN_2 ?? raw.TLFN_2 ?? null,
                        tlfn3: l.TLFN_3 ?? raw.TLFN_3 ?? null,
                        tlfn4: l.TLFN_4 ?? raw.TLFN_4 ?? null,
                        tlfn5: l.TLFN_5 ?? raw.TLFN_5 ?? null,
                        telComercialSiebel: l.TEL_COMERCIAL_SIEBEL ?? raw.TEL_COMERCIAL_SIEBEL ?? null,
                        telCelularSiebel: l.TEL_CELULAR_SIEBEL ?? raw.TEL_CELULAR_SIEBEL ?? null,
                        telResidencialSiebel: l.TEL_RESIDENCIAL_SIEBEL ?? raw.TEL_RESIDENCIAL_SIEBEL ?? null,
                        // Planta Vivo
                        tpProduto: l.TP_PRODUTO ?? raw.TP_PRODUTO ?? null,
                        qtMovelTerm: l.QT_MOVEL_TERM ?? raw.QT_MOVEL_TERM ?? null,
                        qtMovelPen: l.QT_MOVEL_PEN ?? raw.QT_MOVEL_PEN ?? null,
                        qtMovelM2m: l.QT_MOVEL_M2M ?? raw.QT_MOVEL_M2M ?? null,
                        qtBasicaFibra: l.QT_BASICA_TERM_FIBRA ?? raw.QT_BASICA_TERM_FIBRA ?? null,
                        qtBasicaMetalico: l.QT_BASICA_TERM_METALICO ?? raw.QT_BASICA_TERM_METALICO ?? null,
                        qtBasicaBl: l.QT_BASICA_BL ?? raw.QT_BASICA_BL ?? null,
                        qtBlFtth: l.QT_BL_FTTH ?? raw.QT_BL_FTTH ?? null,
                        qtBlFttc: l.QT_BL_FTTC ?? raw.QT_BL_FTTC ?? null,
                        qtBasicaTv: l.QT_BASICA_TV ?? raw.QT_BASICA_TV ?? null,
                        qtBasicaOutros: l.QT_BASICA_OUTROS ?? raw.QT_BASICA_OUTROS ?? null,
                        qtBasicaLinhas: l.QT_BASICA_LINAS ?? raw.QT_BASICA_LINAS ?? null,
                        qtAvancadaDados: l.QT_AVANCADA_DADOS ?? raw.QT_AVANCADA_DADOS ?? null,
                        avancadaVoz: l.AVANCADA_VOZ ?? raw.AVANCADA_VOZ ?? null,
                        qtVivoTech: l.QT_VIVO_TECH ?? raw.QT_VIVO_TECH ?? null,
                        qtVvn: l.QT_VVN ?? raw.QT_VVN ?? null,
                        dataFimVtech: l.DATA_FIM_VTECH ?? raw.DATA_FIM_VTECH ?? null,
                        flgTrocaVtech: l.FLG_TROCA_VTECH ?? raw.FLG_TROCA_VTECH ?? null,
                        flgPqDigital: l.FLG_PQ_DIGITAL ?? raw.FLG_PQ_DIGITAL ?? null,
                      };

                      const phonesList = [
                        { label: "Contato Principal", value: mp.celularContatoSfa },
                        { label: "TLFN_1", value: mp.tlfn1 },
                        { label: "TLFN_2", value: mp.tlfn2 },
                        { label: "TLFN_3", value: mp.tlfn3 },
                        { label: "TLFN_4", value: mp.tlfn4 },
                        { label: "TLFN_5", value: mp.tlfn5 },
                        { label: "TEL_COMERCIAL_SIEBEL", value: mp.telComercialSiebel },
                        { label: "TEL_CELULAR_SIEBEL", value: mp.telCelularSiebel },
                        { label: "TEL_RESIDENCIAL_SIEBEL", value: mp.telResidencialSiebel },
                      ].filter((p) => p.value);

                      return (
                        <div className="space-y-6 animate-in slide-in-from-left-2">
                          {/* Dados da Empresa */}
                          <div className="border-l-4 border-neon-pink pl-4 bg-slate-900/50 p-4 space-y-3">
                            <h3 className="text-xl font-bold text-white uppercase tracking-wider mb-2">Dados da Empresa</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <label className="text-[10px] uppercase text-slate-500 tracking-widest">CNPJ</label>
                                <p className="text-white font-mono text-sm font-bold">{mp.cnpj || "-"}</p>
                              </div>
                              <div>
                                <label className="text-[10px] uppercase text-slate-500 tracking-widest">Nome</label>
                                <p className="text-white font-mono text-sm">{mp.nome || "-"}</p>
                              </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="space-y-1">
                                <label className="text-[10px] uppercase text-slate-500 tracking-widest">Endereço</label>
                                <p className="text-white text-sm">
                                  {mp.endereco || "-"} {mp.numero ? `, ${mp.numero}` : ""} <br />
                                  {mp.cidade || "-"} {mp.cep ? `- CEP: ${mp.cep}` : ""}
                                </p>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div className="bg-pic-card p-3 border border-slate-700">
                                  <label className="text-[10px] uppercase text-slate-500 tracking-widest">Vertical</label>
                                  <p className="text-neon-blue font-bold uppercase">{mp.vertical ?? "-"}</p>
                                </div>
                                <div className="bg-pic-card p-3 border border-slate-700">
                                  <label className="text-[10px] uppercase text-slate-500 tracking-widest">Rede</label>
                                  <p className="text-white font-mono">{mp.nomeRede ?? "-"}</p>
                                </div>
                                <div className="bg-pic-card p-3 border border-slate-700">
                                  <label className="text-[10px] uppercase text-slate-500 tracking-widest">Filiais SFA</label>
                                  <p className="text-white font-mono">{mp.qtdSfaFiliais ?? "-"}</p>
                                </div>
                                <div className="bg-pic-card p-3 border border-slate-700">
                                  <label className="text-[10px] uppercase text-slate-500 tracking-widest">Bio</label>
                                  <p className="text-white font-mono">{mp.flgCliBiometrado ?? "NÃO"}</p>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Planta Vivo */}
                          <div className="border-l-4 border-neon-green pl-4 bg-slate-900/50 p-4">
                            <h3 className="text-sm font-bold text-neon-green uppercase tracking-wider mb-4 border-b border-dashed border-slate-700 pb-2">
                              Planta Vivo
                            </h3>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-y-3 gap-x-2">
                              <InfoItem label="Produto" value={mp.tpProduto ?? "-"} />
                              <InfoItem label="Móvel Term" value={mp.qtMovelTerm} treatMissingAsZero />
                              <InfoItem label="Móvel Pen" value={mp.qtMovelPen} treatMissingAsZero />
                              <InfoItem label="M2M" value={mp.qtMovelM2m} treatMissingAsZero />
                              <InfoItem label="Básica Fibra" value={mp.qtBasicaFibra} treatMissingAsZero />
                              <InfoItem label="Básica Metálico" value={mp.qtBasicaMetalico} treatMissingAsZero />
                              <InfoItem label="Básica BL" value={mp.qtBasicaBl} treatMissingAsZero />
                              <InfoItem label="BL FTTH" value={mp.qtBlFtth} treatMissingAsZero />
                              <InfoItem label="BL FTTC" value={mp.qtBlFttc} treatMissingAsZero />
                              <InfoItem label="Básica TV" value={mp.qtBasicaTv} treatMissingAsZero />
                              <InfoItem label="Básica Outros" value={mp.qtBasicaOutros} treatMissingAsZero />
                              <InfoItem label="Básica Linhas" value={mp.qtBasicaLinhas} treatMissingAsZero />
                              <InfoItem label="Avançada Dados" value={mp.qtAvancadaDados} treatMissingAsZero />
                              <InfoItem label="Avançada Voz" value={mp.avancadaVoz} treatMissingAsZero />
                              <InfoItem label="Vivo Tech" value={mp.qtVivoTech} treatMissingAsZero />
                              <InfoItem label="VVN" value={mp.qtVvn} treatMissingAsZero />
                              <InfoItem label="Fim VTech" value={formatDate(mp.dataFimVtech)} />
                              <InfoItem label="Troca VTech" value={mp.flgTrocaVtech ?? "-"} />
                              <InfoItem label="PQ Digital" value={mp.flgPqDigital ?? "-"} />
                            </div>
                          </div>

                          {/* Contatos Mapa Parque */}
                          <div className="border-l-4 border-neon-blue pl-4">
                            <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4">Contatos Mapa Parque</h3>
                            {(mp.nmContatoSfa || mp.emailContatoSfa || mp.celularContatoSfa) && (
                              <div className="mb-4 bg-pic-card p-3 border border-slate-700">
                                <p className="text-xs font-bold text-white mb-1">{mp.nmContatoSfa || "Contato Principal"}</p>
                                <p className="text-xs text-neon-blue font-mono">{mp.celularContatoSfa}</p>
                                <p className="text-[10px] text-slate-500">{mp.emailContatoSfa}</p>
                              </div>
                            )}
                            <div className="space-y-2">
                              <label className="text-[10px] uppercase text-slate-500 tracking-widest block">Telefones</label>
                              {phonesList.length > 0 ? (
                                phonesList.map((tel, idx) => (
                                  <div key={idx} className="space-y-1">
                                    <PhoneItem
                                      phone={{ rotulo: "Tel Mapa Parque", valor: tel.value as string, feedback: null }}
                                      onFeedback={handlePhoneFeedback}
                                    />
                                    <p className="text-[10px] text-slate-500">Fonte: {tel.label}</p>
                                  </div>
                                ))
                              ) : (
                                <p className="text-slate-600 text-xs italic">Sem telefones cadastrados.</p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })() || (
                    // STANDARD LAYOUT
                    <>
                      <div className="border-l-4 border-neon-green pl-4">
                        <h3 className="text-xl font-bold text-white uppercase tracking-wider mb-4">Dados da Empresa</h3>
                        <div className="space-y-4">
                          <div className="space-y-1">
                            <label className="text-[10px] uppercase text-slate-500 tracking-widest">Razão Social</label>
                            <div className="bg-black border border-slate-800 p-3 text-white font-mono text-sm">
                              {lead.razaoSocial ?? "-"}
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
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
                          </div>
                        </div>
                      </div>

                      <div className="border-l-4 border-neon-blue pl-4">
                        <div className="flex justify-between items-center mb-4">
                          <h3 className="text-xl font-bold text-white uppercase tracking-wider">Contatos Válidos</h3>
                          <button
                            onClick={() => setShowContactForm(!showContactForm)}
                            className="bg-neon-blue text-black text-[10px] uppercase font-black px-3 py-1 hover:bg-white"
                          >
                            + Adicionar
                          </button>
                        </div>

                        {showContactForm && (
                          <div className="bg-slate-900/50 p-4 border border-slate-700 mb-4 animate-in fade-in slide-in-from-top-2">
                            <div className="grid grid-cols-2 gap-2 mb-2">
                              <input placeholder="Nome" value={newContact.name} onChange={e => setNewContact({ ...newContact, name: e.target.value })} className="bg-black border border-slate-600 text-white text-xs p-2" />
                              <input placeholder="Cargo/Papel" value={newContact.role} onChange={e => setNewContact({ ...newContact, role: e.target.value })} className="bg-black border border-slate-600 text-white text-xs p-2" />
                              <input placeholder="Telefone" value={newContact.phone} onChange={e => setNewContact({ ...newContact, phone: e.target.value })} className="bg-black border border-slate-600 text-white text-xs p-2" />
                              <input placeholder="Email" value={newContact.email} onChange={e => setNewContact({ ...newContact, email: e.target.value })} className="bg-black border border-slate-600 text-white text-xs p-2" />
                            </div>
                            <div className="flex justify-end gap-2">
                              <button onClick={() => setShowContactForm(false)} className="text-xs text-slate-500 uppercase">Cancelar</button>
                              <button onClick={saveContact} disabled={savingContact} className="text-xs bg-neon-green text-black px-4 py-1 font-bold uppercase hover:bg-white">
                                {savingContact ? "Salvando..." : "Salvar Contato"}
                              </button>
                            </div>
                          </div>
                        )}

                        <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                          {contacts.map((c, i) => (
                            <div key={i} className="flex justify-between items-center bg-pic-card border border-slate-800 p-2 hover:border-slate-600">
                              <div>
                                <p className="text-sm font-bold text-white">{c.name}</p>
                                <p className="text-[10px] text-slate-500 uppercase">{c.role}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-xs text-neon-blue font-mono">{c.phone}</p>
                                <p className="text-[10px] text-slate-600">{c.email}</p>
                              </div>
                            </div>
                          ))}
                          {contacts.length === 0 && <p className="text-xs text-slate-600 italic">Nenhum contato qualificado.</p>}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] uppercase text-slate-500 tracking-widest mb-2 block">Telefones (Geral)</label>
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
                    </>
                  )}
                </div>

                {/* Right Column: Enrichment */}
                <div className="border-l-4 border-neon-pink pl-0 md:pl-0 pt-0">
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
            </div>
          )}

          {tab === "tratativa" && (
            <div className="space-y-6">
              {/* 1. Status Section */}
              <div className="bg-pic-card border-2 border-slate-700 p-5 shadow-lg">
                <div className="flex items-center gap-2 mb-4">
                  <Activity size={16} className="text-neon-pink" />
                  <h3 className="text-sm font-bold uppercase text-white tracking-widest">Status & Fluxo</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Estágio Atual</label>
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

                  {/* Loss Reason Fields (Conditional) */}
                  {selectedStatus === "PERDIDO" && (
                    <div className="bg-red-900/10 border border-red-500/30 p-3 animate-in fade-in rounded space-y-3">
                      <div>
                        <label className="text-[10px] font-bold text-red-400 uppercase tracking-widest block mb-1">Motivo da Perda (Palitagem) *</label>
                        <select
                          value={lossMotivo}
                          onChange={(e) => setLossMotivo(e.target.value)}
                          className="w-full bg-black text-white border border-red-500/50 p-2 text-xs mb-2 outline-none focus:border-red-500"
                        >
                          {lossMotivos.map((m) => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </div>
                      <div>
                        <input
                          placeholder="Justificativa (obrigatório)..."
                          value={lossJust}
                          onChange={(e) => setLossJust(e.target.value)}
                          className="w-full bg-black text-white border border-red-500/50 p-2 text-xs outline-none focus:border-red-500"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-4 flex justify-end gap-3">
                  {statusDirty && (
                    <div className="text-xs text-neon-pink font-bold flex items-center animate-pulse">Save pending...</div>
                  )}
                  <button
                    onClick={handleStatusSave}
                    disabled={!statusDirty}
                    className={`font-black uppercase py-2 px-6 text-xs tracking-widest transition-all ${statusDirty
                      ? "bg-neon-pink text-white hover:bg-pink-600 shadow-[4px_4px_0px_0px_rgba(255,0,153,0.5)]"
                      : "bg-slate-800 text-slate-500 cursor-not-allowed"
                      }`}
                  >
                    {statusDirty ? "Salvar Status" : "Sem Alterações"}
                  </button>
                </div>
              </div>

              <div className="w-full border-b border-dashed border-slate-800 opacity-50"></div>

              {/* 2. Unified Activity Form */}
              <div className="bg-pic-card border border-slate-800 p-5 relative">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
                  <p className="text-xs font-bold uppercase text-slate-400 tracking-widest flex items-center gap-2">
                    <Clock size={14} className="text-neon-blue" />
                    Nova Tratativa / FUP
                  </p>

                  {/* Quick Actions */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => setActivityForm(p => ({ ...p, type: 'Follow-up', nextFollowUp: new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 16) }))}
                      className="text-[10px] font-bold uppercase bg-slate-800 text-neon-blue px-3 py-1 hover:bg-neon-blue hover:text-black transition-colors"
                    >
                      + Agendar FUP (48h)
                    </button>
                    <button
                      onClick={() => setActivityForm(p => ({ ...p, type: 'Reunião', nextFollowUp: new Date(Date.now() + 86400000).toISOString().slice(0, 16) }))}
                      className="text-[10px] font-bold uppercase bg-slate-800 text-neon-green px-3 py-1 hover:bg-neon-green hover:text-black transition-colors"
                    >
                      + Agendar Reunião
                    </button>
                  </div>
                </div>

                <div className="space-y-4">
                  {/* Linha 1: Tipo, Canal, Data FUP */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-500 uppercase">Tipo</label>
                      <select
                        value={activityForm.type}
                        onChange={e => setActivityForm(p => ({ ...p, type: e.target.value }))}
                        className="w-full bg-black border border-slate-600 text-white text-sm p-3 focus:border-neon-blue outline-none"
                      >
                        {ACTIVITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-500 uppercase">Canal</label>
                      <select
                        value={activityForm.channel}
                        onChange={e => setActivityForm(p => ({ ...p, channel: e.target.value }))}
                        className="w-full bg-black border border-slate-600 text-white text-sm p-3 focus:border-neon-blue outline-none"
                      >
                        {CHANNEL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-neon-green font-bold uppercase flex items-center gap-1">
                        Lembrete / Data <Clock size={10} />
                      </label>
                      <input
                        type="datetime-local"
                        value={activityForm.nextFollowUp}
                        onChange={e => setActivityForm(p => ({ ...p, nextFollowUp: e.target.value }))}
                        className="w-full bg-black border border-slate-600 text-white text-sm p-3 focus:border-neon-green outline-none placeholder-slate-500"
                      />
                    </div>
                  </div>

                  {/* Linha 2: Resultado e Nota */}
                  <div className="space-y-2">
                    <select
                      value={activityForm.outcome}
                      onChange={e => setActivityForm(p => ({ ...p, outcome: e.target.value }))}
                      className="w-full bg-black border border-slate-600 text-white text-sm p-2 focus:border-neon-blue outline-none"
                    >
                      <option value="">Selecione Resultado (Opcional)...</option>
                      {OUTCOME_OPTIONS.map(o => <option key={o.code} value={o.code}>{o.label}</option>)}
                    </select>

                    <textarea
                      value={activityForm.note}
                      onChange={e => setActivityForm(p => ({ ...p, note: e.target.value }))}
                      className="w-full bg-black border border-slate-600 text-white text-sm p-3 font-mono focus:border-neon-blue outline-none resize-none"
                      rows={3}
                      placeholder="Descreva a interação, ata da reunião ou próximos passos..."
                    />
                  </div>

                  <div className="flex justify-end">
                    <button
                      onClick={saveActivity}
                      disabled={savingActivity}
                      className="bg-neon-blue text-black font-black uppercase text-xs px-6 py-3 hover:bg-cyan-300 transition-colors shadow-[4px_4px_0px_0px_rgba(0,240,255,0.4)]"
                    >
                      {savingActivity ? "Salvando..." : "Registrar Tratativa"}
                    </button>
                  </div>
                </div>
              </div>

              {/* Timeline (Feed) */}
              <div className="relative pt-4">
                <div className="absolute left-[19px] top-4 bottom-0 w-[2px] bg-slate-800"></div>
                <div className="space-y-6 pl-2">
                  {activities.map((a, idx) => (
                    <div key={a.id} className="relative flex gap-4 group">
                      <div className="z-10 bg-black border-2 border-slate-600 group-hover:border-neon-green w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors">
                        <span className="text-[10px] font-bold text-slate-400 group-hover:text-neon-green">
                          {activities.length - idx}
                        </span>
                      </div>
                      <div className="flex-1 bg-pic-card border border-slate-800 p-4 hover:border-slate-600 transition-colors relative">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <p className="text-neon-blue font-bold text-xs uppercase tracking-wider">{a.activityType}</p>
                            <p className="text-[10px] text-slate-500 uppercase tracking-widest">{new Date(a.createdAt).toLocaleString()} • {a.user?.name ?? "Sistema"}</p>
                          </div>
                          {a.outcomeLabel && <span className="bg-slate-800 text-slate-300 text-[10px] px-2 py-1 rounded-full uppercase">{a.outcomeLabel}</span>}
                        </div>
                        <p className="text-slate-300 font-mono text-sm leading-relaxed whitespace-pre-wrap">{a.note}</p>

                        {a.nextFollowUpAt && (
                          <div className="mt-3 inline-flex items-center gap-2 bg-amber-900/20 border border-amber-900/50 px-3 py-1 rounded">
                            <Clock size={12} className="text-amber-500" />
                            <span className="text-xs text-amber-500 font-bold uppercase">Follow-up: {new Date(a.nextFollowUpAt).toLocaleString()}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {activities.length === 0 && <p className="text-center text-slate-600 text-sm py-4">Nenhuma atividade registrada.</p>}
                </div>
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




        </div>
      </div>
    </div>
  );
}
