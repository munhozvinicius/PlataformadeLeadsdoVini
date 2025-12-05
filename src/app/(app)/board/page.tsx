"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  FormEvent,
  ChangeEvent,
  useRef,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { LEAD_STATUS, LeadStatusId } from "@/constants/leadStatus";
import { Role } from "@prisma/client";
import { PRODUCT_CATALOG, ProductCatalogItem, TOWER_OPTIONS } from "@/lib/productCatalog";

type ViewerRole = Role;

type LeadProduct = {
  productId: string;
  tower: string;
  category: string;
  name: string;
  quantity: number;
  monthlyValue?: number | null;
  note?: string | null;
};

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
  telefones?: { rotulo: string; valor: string }[];
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
  lastOutcomeLabel?: string | null;
  lastOutcomeNote?: string | null;
  nextFollowUpAt?: string | null;
  nextStepNote?: string | null;
  createdAt?: string | null;
  site?: string | null;
  contatoPrincipal?: { nome?: string; cargo?: string; telefone?: string; email?: string };
  productCart?: LeadProduct[] | null;
  telefones?: { rotulo: string; valor: string }[];
};

type LeadEvent = {
  id: string;
  leadId: string;
  userId: string;
  type: string;
  payload?: unknown;
  createdAt: string;
};

type LeadEnrichmentSuggestion = {
  id: string;
  leadId: string;
  type: string;
  source: string;
  value: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED" | string;
  createdAt: string;
};

type LeadActivity = {
  id: string;
  activityType: string;
  channel?: string | null;
  outcomeCode?: string | null;
  outcomeLabel?: string | null;
  note: string;
  stageBefore?: LeadStatusId | null;
  stageAfter?: LeadStatusId | null;
  nextFollowUpAt?: string | null;
  nextStepNote?: string | null;
  createdAt: string;
  user?: { id: string; name?: string | null; email?: string | null; role?: string | null };
};

type ActivityFormState = {
  activityType: string;
  channel: string;
  outcomeCode: string;
  outcomeLabel: string;
  newStage: LeadStatusId;
  nextFollowUpAt: string;
  nextStepNote: string;
  note: string;
};

type ConsultantBoardProps = {
  viewerRole: ViewerRole;
  consultantId?: string;
  campaignId?: string;
  refreshSignal: number;
  onCampaignsUpdate?: (campaigns: { id: string; name: string }[]) => void;
  officeIds?: string[];
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

function stageLabel(id: LeadStatusId) {
  return LEAD_STATUS.find((s) => s.id === id)?.title ?? id;
}

function formatDate(value?: string | Date | null, withTime = false) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return withTime
    ? date.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function datetimeLocalValue(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

function LeadDrawer({
  lead,
  onClose,
  onStageChange,
  onActivitySaved,
}: {
  lead: Lead;
  onClose: () => void;
  onStageChange: (leadId: string, stage: LeadStatusId) => Promise<void>;
  onActivitySaved: () => Promise<void>;
}) {
  const [activeTab, setActiveTab] = useState<"dados" | "atividades" | "enriquecimento">("dados");
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [form, setForm] = useState<ActivityFormState>({
    activityType: ACTIVITY_TYPES[0],
    channel: CHANNEL_OPTIONS[0].value,
    outcomeCode: "",
    outcomeLabel: "",
    newStage: lead.status,
    nextFollowUpAt: "",
    nextStepNote: "",
    note: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>("");
  const [newPhone, setNewPhone] = useState({ rotulo: "", valor: "" });
  const [savingPhone, setSavingPhone] = useState(false);
  const [siteValue, setSiteValue] = useState(lead.site ?? "");
  const [emailValue, setEmailValue] = useState((lead.emails && lead.emails[0]) || "");
  const [contactName, setContactName] = useState(lead.contatoPrincipal?.nome ?? "");
  const [leadProducts, setLeadProducts] = useState<LeadProduct[]>(
    Array.isArray(lead.productCart) ? (lead.productCart as LeadProduct[]) : [],
  );
  const [productFilters, setProductFilters] = useState({ tower: "", category: "", search: "" });
  const [productsSaving, setProductsSaving] = useState(false);
  const [productSaveState, setProductSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const saveProductsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [events, setEvents] = useState<LeadEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<LeadEnrichmentSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState<string>("");
  const [additionalPhones, setAdditionalPhones] = useState<{ rotulo: string; valor: string }[]>([]);
  const empresaNome = lead.razaoSocial ?? lead.nomeFantasia ?? "Não informado";
  const documento = (lead.documento ?? lead.cnpj ?? "Não informado").toString();
  const vertical = lead.vertical ?? "Não informado";
  const cidadeUf =
    lead.cidade || lead.estado
      ? `${lead.cidade ?? "Não informado"}${lead.estado ? ` / ${lead.estado}` : ""}`
      : "Não informado";
  const logradouro = lead.logradouro ?? lead.endereco ?? "Não informado";
  const cepNumero = `${lead.cep ?? "Não informado"} / ${lead.numero ?? "Não informado"}`;
  const territorio = lead.territorio ?? "Não informado";
  const faturamento = lead.vlFatPresumido ?? "Não informado";
  const ofertaMkt = lead.ofertaMkt ?? "Não informado";
  const estrategia = lead.estrategia ?? "Não informado";

  const loadActivities = useCallback(async () => {
    setActivitiesLoading(true);
    try {
      const res = await fetch(`/api/activities?leadId=${lead.id}`, { cache: "no-store" });
      if (res.ok) {
        setActivities(await res.json());
      }
    } finally {
      setActivitiesLoading(false);
    }
  }, [lead.id]);

  const loadEvents = useCallback(async () => {
    setEventsLoading(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}/events`, { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as LeadEvent[];
        setEvents(data);
      }
    } catch (err) {
      console.error("Erro ao carregar eventos", err);
    } finally {
      setEventsLoading(false);
    }
  }, [lead.id]);

  const createEvent = useCallback(
    async (type: string, payload?: unknown) => {
      try {
        await fetch(`/api/leads/${lead.id}/events`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type, payload }),
        });
        loadEvents();
      } catch (err) {
        console.error("Erro ao registrar evento", err);
      }
    },
    [lead.id, loadEvents],
  );

  const loadLeadProducts = useCallback(async () => {
    try {
      const res = await fetch(`/api/leads/${lead.id}/products`, { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as LeadProduct[];
        setLeadProducts(data);
        setProductSaveState("idle");
      }
    } catch (err) {
      console.error("Erro ao carregar produtos do lead", err);
    }
  }, [lead.id]);

  const normalizePhone = (value: string) => value.replace(/\D+/g, "");

  const persistProducts = useCallback(
    async (items: LeadProduct[]) => {
      setProductsSaving(true);
      try {
        const res = await fetch(`/api/leads/${lead.id}/products`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ products: items }),
        });
        if (!res.ok) {
          throw new Error("Erro ao salvar produtos");
        }
        setProductSaveState("saved");
        createEvent("PRODUCT_CART_UPDATE", { count: items.length });
      } catch (err) {
        console.error(err);
        setProductSaveState("error");
      } finally {
        setProductsSaving(false);
      }
    },
    [lead.id, createEvent],
  );

  const queueProductSave = useCallback(
    (items: LeadProduct[]) => {
      setLeadProducts(items);
      setProductSaveState("saving");
      if (saveProductsTimer.current) clearTimeout(saveProductsTimer.current);
      saveProductsTimer.current = setTimeout(() => persistProducts(items), 700);
    },
    [persistProducts],
  );

  const addProductToLead = useCallback(
    (product: ProductCatalogItem) => {
      const existingIndex = leadProducts.findIndex((p) => p.productId === product.id);
      const next = [...leadProducts];
      if (existingIndex >= 0) {
        next[existingIndex] = { ...next[existingIndex], quantity: next[existingIndex].quantity + 1 };
      } else {
        next.push({
          productId: product.id,
          tower: product.tower,
          category: product.category,
          name: product.name,
          quantity: 1,
        });
      }
      queueProductSave(next);
    },
    [leadProducts, queueProductSave],
  );

  const updateProductField = useCallback(
    (productId: string, field: keyof LeadProduct, value: unknown) => {
      const next = leadProducts.map((item) =>
        item.productId === productId ? { ...item, [field]: value } : item,
      );
      queueProductSave(next);
    },
    [leadProducts, queueProductSave],
  );

  const removeProduct = useCallback(
    (productId: string) => {
      queueProductSave(leadProducts.filter((p) => p.productId !== productId));
    },
    [leadProducts, queueProductSave],
  );

  const categoryOptions = useMemo(() => {
    if (!productFilters.tower) return Array.from(new Set(PRODUCT_CATALOG.map((p) => p.category)));
    return Array.from(
      new Set(PRODUCT_CATALOG.filter((p) => p.tower === productFilters.tower).map((p) => p.category)),
    );
  }, [productFilters.tower]);

  const filteredCatalog = useMemo(
    () =>
      PRODUCT_CATALOG.filter((item) => {
        const matchesTower = productFilters.tower ? item.tower === productFilters.tower : true;
        const matchesCategory = productFilters.category ? item.category === productFilters.category : true;
        const matchesSearch = productFilters.search
          ? item.name.toLowerCase().includes(productFilters.search.toLowerCase())
          : true;
        return matchesTower && matchesCategory && matchesSearch;
      }),
    [productFilters],
  );

  const timelineItems = useMemo(() => {
    const activityEvents: LeadEvent[] = activities.map((a) => ({
      id: `activity-${a.id}`,
      leadId: lead.id,
      userId: a.user?.id ?? "",
      type: "ACTIVITY",
      payload: {
        activityType: a.activityType,
        channel: a.channel,
        outcomeLabel: a.outcomeLabel,
        note: a.note,
        nextFollowUpAt: a.nextFollowUpAt,
        stageBefore: a.stageBefore,
        stageAfter: a.stageAfter,
        user: a.user,
      },
      createdAt: a.createdAt,
    }));
    const combined = [...events, ...activityEvents];
    return combined.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [activities, events, lead.id]);

  const thermometer = useMemo(() => {
    let score = 0;
    events.forEach((ev) => {
      if (ev.type === "PHONE_VALIDATION") {
        const verdict = (ev.payload as any)?.verdict;
        if (verdict === "good") score += 2;
        if (verdict === "bad") score -= 2;
      }
      if (ev.type === "STATUS" && (ev.payload as any)?.to === "PERDIDO") score -= 3;
    });
    const label = score >= 4 ? "Lead quente" : score >= 0 ? "Lead morno" : "Lead frio";
    return { score, label };
  }, [events]);

  const fetchSuggestions = useCallback(async () => {
    setSuggestionsLoading(true);
    setSuggestionsError("");
    try {
      const res = await fetch(`/api/leads/${lead.id}/enrich`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setSuggestionsError(data?.message || "Erro ao buscar sugestões");
        return;
      }
      const data = (await res.json()) as LeadEnrichmentSuggestion[];
      setSuggestions(data.filter((s) => s.status === "PENDING"));
    } catch (err) {
      console.error(err);
      setSuggestionsError("Falha de conexão ao buscar sugestões");
    } finally {
      setSuggestionsLoading(false);
    }
  }, [lead.id]);

  const acceptSuggestion = useCallback(
    async (suggestion: LeadEnrichmentSuggestion) => {
      await fetch(`/api/leads/${lead.id}/enrichment/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suggestionId: suggestion.id, type: suggestion.type, value: suggestion.value, source: suggestion.source }),
      });
      setSuggestions((prev) => prev.filter((s) => s.id !== suggestion.id));
      if (suggestion.type === "PHONE") {
        setAdditionalPhones((prev) => {
          const exists = prev.some((p) => normalizePhone(p.valor) === normalizePhone(suggestion.value));
          if (exists) return prev;
          return [...prev, { rotulo: "Enriquecimento", valor: suggestion.value }];
        });
      }
      loadEvents();
    },
    [lead.id, loadEvents],
  );

  const rejectSuggestion = useCallback(
    async (suggestion: LeadEnrichmentSuggestion) => {
      await fetch(`/api/leads/${lead.id}/enrichment/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suggestionId: suggestion.id }),
      });
      setSuggestions((prev) => prev.filter((s) => s.id !== suggestion.id));
      loadEvents();
    },
    [lead.id, loadEvents],
  );

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      newStage: lead.status,
      nextFollowUpAt: datetimeLocalValue(lead.nextFollowUpAt ?? null),
      nextStepNote: lead.nextStepNote ?? "",
    }));
    loadActivities();
    setSiteValue(lead.site ?? "");
    setEmailValue((lead.emails && lead.emails[0]) || "");
    setContactName(lead.contatoPrincipal?.nome ?? "");
    setLeadProducts(Array.isArray(lead.productCart) ? (lead.productCart as LeadProduct[]) : []);
    loadLeadProducts();
    loadEvents();
    createEvent("OPEN", { ts: new Date().toISOString() });
    const extraPhones = Array.isArray(lead.telefones)
      ? (lead.telefones as { rotulo: string; valor: string }[])
      : [];
    setAdditionalPhones(extraPhones);
  }, [
    lead.id,
    lead.status,
    lead.nextFollowUpAt,
    lead.nextStepNote,
    loadActivities,
    lead.site,
    lead.emails,
    lead.contatoPrincipal,
    lead.productCart,
    loadLeadProducts,
    loadEvents,
    createEvent,
  ]);

  const handleFormChange = (
    event: ChangeEvent<HTMLSelectElement | HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const submitActivity = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!form.note.trim()) {
      setError("Observação é obrigatória");
      return;
    }
    setSaving(true);
    const payload = {
      leadId: lead.id,
      activityType: form.activityType,
      channel: form.channel,
      outcomeCode: form.outcomeCode || null,
      outcomeLabel: form.outcomeLabel || null,
      note: form.note,
      newStage: form.newStage,
      nextFollowUpAt: form.nextFollowUpAt ? new Date(form.nextFollowUpAt).toISOString() : null,
      nextStepNote: form.nextStepNote || null,
    };

    const res = await fetch("/api/activities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (!res.ok) {
      setError("Erro ao salvar atividade.");
      return;
    }

    setForm((prev) => ({
      ...prev,
      note: "",
      outcomeCode: "",
      outcomeLabel: "",
      nextFollowUpAt: prev.nextFollowUpAt,
    }));
    await Promise.all([loadActivities(), onActivitySaved()]);
    await createEvent("NOTE", {
      activityType: form.activityType,
      channel: form.channel,
      outcomeCode: form.outcomeCode,
      outcomeLabel: form.outcomeLabel,
      note: form.note,
      nextFollowUpAt: form.nextFollowUpAt,
      newStage: form.newStage,
    });
  };

  async function addPhone() {
    if (!newPhone.rotulo || !newPhone.valor) return;
    setSavingPhone(true);
    await fetch(`/api/consultor/leads/${lead.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ addTelefone: newPhone, observacao: "Telefone adicionado via ficha" }),
    });
    setNewPhone({ rotulo: "", valor: "" });
    setSavingPhone(false);
    await onActivitySaved();
    await createEvent("PHONE_UPDATE", { ...newPhone });
    setAdditionalPhones((prev) => {
      const exists = prev.some((p) => normalizePhone(p.valor) === normalizePhone(newPhone.valor));
      if (exists) return prev;
      return [...prev, { rotulo: newPhone.rotulo, valor: newPhone.valor }];
    });
  }

  async function saveContactFields() {
    await fetch(`/api/consultor/leads/${lead.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        site: siteValue || null,
        email: emailValue || null,
        contatoPrincipal: contactName ? { nome: contactName } : null,
        observacao: "Atualização de contato/site",
      }),
    });
    await onActivitySaved();
    await createEvent("CONTACT_UPDATE", {
      site: siteValue || null,
      email: emailValue || null,
      contactName,
    });
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (saveProductsTimer.current) clearTimeout(saveProductsTimer.current);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="absolute inset-0 z-0" onClick={onClose} aria-hidden />
      <div className="relative z-10 flex h-[90vh] w-[min(1200px,95vw)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b bg-white/95 px-6 py-4 backdrop-blur">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Lead</p>
            <h2 className="text-2xl font-semibold leading-tight text-slate-900">
              {lead.razaoSocial ?? lead.nomeFantasia ?? "Sem empresa"}
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                {stageLabel(lead.status)}
              </span>
              <span>{lead.campanha?.nome ?? "Campanha não informada"}</span>
              {documento ? <span className="text-slate-500">CNPJ/Doc: {documento}</span> : null}
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Fechar
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-6">
          <div className="flex gap-2 border-b pb-3 pt-4">
            <button
              onClick={() => setActiveTab("dados")}
              className={`rounded-md px-3 py-2 text-sm font-medium ${
                activeTab === "dados" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              Dados do cliente
            </button>
            <button
              onClick={() => setActiveTab("atividades")}
              className={`rounded-md px-3 py-2 text-sm font-medium ${
                activeTab === "atividades"
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              Atividades / Notas
            </button>
            <button
              onClick={() => setActiveTab("enriquecimento")}
              className={`rounded-md px-3 py-2 text-sm font-medium ${
                activeTab === "enriquecimento"
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              Enriquecimento online
            </button>
          </div>

          {activeTab === "dados" ? (
            <div className="space-y-6 py-4">
              <div className="rounded-xl border border-slate-200 bg-gradient-to-r from-emerald-50 via-white to-slate-50 p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase text-slate-500">Termômetro do lead</p>
                    <p className="text-lg font-semibold text-slate-900">{thermometer.label}</p>
                    <p className="text-sm text-slate-600">Score: {thermometer.score}</p>
                  </div>
                  <div className="h-12 w-12 rounded-full border border-emerald-200 bg-white text-center text-sm font-semibold text-emerald-700 shadow-sm flex items-center justify-center">
                    {thermometer.score}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm md:col-span-2">
                  <p className="text-xs uppercase text-slate-500">Empresa</p>
                  <p className="text-lg font-semibold text-slate-900">{empresaNome}</p>
                  <p className="text-sm text-slate-600">Documento: {documento}</p>
                  <p className="text-sm text-slate-600">Vertical: {vertical}</p>
                  {lead.cnae ? <p className="text-xs text-slate-500">CNAE: {lead.cnae}</p> : null}
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
                  <p className="text-xs uppercase text-slate-500">Localização</p>
                  <p className="text-sm text-slate-700">Cidade / UF: {cidadeUf}</p>
                  <p className="text-sm text-slate-600">Logradouro: {logradouro}</p>
                  <p className="text-sm text-slate-600">CEP / Número: {cepNumero}</p>
                  <p className="text-sm text-slate-600">Território: {territorio}</p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
                  <p className="text-xs uppercase text-slate-500">Informações comerciais</p>
                  <p className="text-sm text-slate-700">Faturamento presumido: {faturamento}</p>
                  <p className="text-sm text-slate-700">Oferta de marketing: {ofertaMkt}</p>
                  <p className="text-sm text-slate-700">Estratégia: {estrategia}</p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
                  <p className="text-xs uppercase text-slate-500">Campanha e estágio</p>
                  <p className="text-sm text-slate-700">Campanha: {lead.campanha?.nome ?? "-"}</p>
                  <label className="mt-2 block text-xs text-slate-500">Mudar estágio</label>
                  <select
                    value={lead.status}
                    onChange={async (e) => {
                      await onStageChange(lead.id, e.target.value as LeadStatusId);
                      loadEvents();
                    }}
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                  >
                    {LEAD_STATUS.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs text-slate-500">Criado em {formatDate(lead.createdAt)}</p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm md:col-span-2">
                  <p className="text-xs uppercase text-slate-500">Contatos & Canais</p>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-xs text-slate-600">Site</label>
                      <input
                        value={siteValue}
                        onChange={(e) => setSiteValue(e.target.value)}
                        className="w-full rounded-lg border px-3 py-2 text-sm"
                        placeholder="https://"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-slate-600">Email</label>
                      <input
                        value={emailValue}
                        onChange={(e) => setEmailValue(e.target.value)}
                        className="w-full rounded-lg border px-3 py-2 text-sm"
                        placeholder="email@empresa.com"
                      />
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <label className="text-xs text-slate-600">Contato principal</label>
                      <input
                        value={contactName}
                        onChange={(e) => setContactName(e.target.value)}
                        className="w-full rounded-lg border px-3 py-2 text-sm"
                        placeholder="Nome do contato"
                      />
                    </div>
                  </div>

                  <div className="mt-3 flex flex-col gap-2">
                    <p className="text-xs uppercase text-slate-500">Telefones</p>
                    {[
                      { rotulo: "Telefone 1", valor: lead.telefone1 },
                      { rotulo: "Telefone 2", valor: lead.telefone2 },
                      { rotulo: "Telefone 3", valor: lead.telefone3 },
                      ...additionalPhones,
                    ].filter((t) => t.valor).length === 0 ? (
                      <p className="text-sm text-slate-600">Telefone não informado</p>
                    ) : null}
                    {[...[
                      { rotulo: "Telefone 1", valor: lead.telefone1 },
                      { rotulo: "Telefone 2", valor: lead.telefone2 },
                      { rotulo: "Telefone 3", valor: lead.telefone3 },
                    ].filter((t) => t.valor), ...additionalPhones]
                      .map((phone, idx) => (
                        <div key={`${phone.valor}-${idx}`} className="flex items-center justify-between gap-2">
                          <a href={`tel:${phone.valor}`} className="text-sm text-slate-800 hover:underline">
                            {phone.rotulo}: {phone.valor}
                          </a>
                          <div className="flex items-center gap-1 text-xs">
                            <button
                              onClick={() =>
                                createEvent("PHONE_VALIDATION", { phone: phone.valor, verdict: "good" })
                              }
                              className="rounded-full border border-emerald-200 px-2 py-1 text-emerald-700 hover:bg-emerald-50"
                            >
                              👍
                            </button>
                            <button
                              onClick={() => {
                                const reason = window.prompt("Motivo da rejeição do telefone?") || "";
                                createEvent("PHONE_VALIDATION", {
                                  phone: phone.valor,
                                  verdict: "bad",
                                  reason: reason || "Sem motivo informado",
                                });
                              }}
                              className="rounded-full border border-red-200 px-2 py-1 text-red-700 hover:bg-red-50"
                            >
                              👎
                            </button>
                          </div>
                        </div>
                      ))}
                    <div className="flex flex-col gap-2 pt-2">
                      <div className="flex flex-col gap-2 md:flex-row">
                        <input
                          className="flex-1 rounded-lg border px-2 py-2 text-sm"
                          placeholder="Rótulo"
                          value={newPhone.rotulo}
                          onChange={(e) => setNewPhone((prev) => ({ ...prev, rotulo: e.target.value }))}
                        />
                        <input
                          className="flex-1 rounded-lg border px-2 py-2 text-sm"
                          placeholder="Telefone"
                          value={newPhone.valor}
                          onChange={(e) => setNewPhone((prev) => ({ ...prev, valor: e.target.value }))}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={addPhone}
                          disabled={savingPhone}
                          className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                        >
                          {savingPhone ? "Salvando..." : "Adicionar telefone"}
                        </button>
                        <button
                          onClick={saveContactFields}
                          className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Salvar contatos
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm xl:col-span-3">
                  <div className="flex flex-col gap-2 border-b border-dashed pb-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-xs uppercase text-slate-500">Catálogo de produtos Vivo</p>
                      <p className="text-sm text-slate-600">
                        Monte a ideia de proposta e registre no carrinho do lead. Autosave ativo.
                      </p>
                    </div>
                    <div className="text-xs text-slate-500">
                      {productSaveState === "saving" || productsSaving
                        ? "Salvando..."
                        : productSaveState === "saved"
                        ? "Salvo"
                        : productSaveState === "error"
                        ? "Erro ao salvar"
                        : "Pronto"}
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-4 xl:grid-cols-2">
                    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                        <div className="space-y-1">
                          <label className="text-xs text-slate-600">Torre</label>
                          <select
                            value={productFilters.tower}
                            onChange={(e) =>
                              setProductFilters((prev) => ({ ...prev, tower: e.target.value, category: "" }))
                            }
                            className="w-full rounded-lg border px-3 py-2 text-sm"
                          >
                            <option value="">Todas</option>
                            {TOWER_OPTIONS.map((tower) => (
                              <option key={tower} value={tower}>
                                {tower}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs text-slate-600">Categoria</label>
                          <select
                            value={productFilters.category}
                            onChange={(e) =>
                              setProductFilters((prev) => ({ ...prev, category: e.target.value }))
                            }
                            className="w-full rounded-lg border px-3 py-2 text-sm"
                          >
                            <option value="">Todas</option>
                            {categoryOptions.map((cat) => (
                              <option key={cat} value={cat}>
                                {cat}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-slate-600">Buscar produto</label>
                        <input
                          value={productFilters.search}
                          onChange={(e) =>
                            setProductFilters((prev) => ({ ...prev, search: e.target.value }))
                          }
                          className="w-full rounded-lg border px-3 py-2 text-sm"
                          placeholder="Digite parte do nome"
                        />
                      </div>

                      <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
                        {filteredCatalog.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-start justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm"
                          >
                            <div>
                              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                <span className="rounded-full bg-slate-100 px-2 py-0.5">{item.tower}</span>
                                <span className="text-slate-600">{item.category}</span>
                              </div>
                              <p className="text-sm font-semibold text-slate-900">{item.name}</p>
                            </div>
                            <button
                              onClick={() => addProductToLead(item)}
                              className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white hover:bg-slate-800"
                            >
                              Adicionar
                            </button>
                          </div>
                        ))}
                        {filteredCatalog.length === 0 ? (
                          <p className="text-sm text-slate-500">Nenhum produto encontrado para o filtro.</p>
                        ) : null}
                      </div>
                    </div>

                    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs uppercase text-slate-500">Carrinho do lead</p>
                          <p className="text-sm text-slate-600">Produtos planejados para este CNPJ.</p>
                        </div>
                        <span className="text-xs text-slate-500">
                          {leadProducts.length} item{leadProducts.length === 1 ? "" : "s"}
                        </span>
                      </div>
                      <div className="overflow-hidden rounded-lg border border-slate-200">
                        <table className="min-w-full divide-y divide-slate-200 text-sm">
                          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                            <tr>
                              <th className="px-3 py-2">Produto</th>
                              <th className="px-3 py-2">Qtd</th>
                              <th className="px-3 py-2">Valor (R$)</th>
                              <th className="px-3 py-2">Obs.</th>
                              <th className="px-3 py-2"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {leadProducts.map((item) => (
                              <tr key={item.productId}>
                                <td className="px-3 py-2 align-top">
                                  <p className="font-semibold text-slate-900">{item.name}</p>
                                  <p className="text-xs text-slate-500">
                                    {item.tower} • {item.category}
                                  </p>
                                </td>
                                <td className="px-3 py-2 align-top">
                                  <input
                                    type="number"
                                    min={1}
                                    value={item.quantity}
                                    onChange={(e) =>
                                      updateProductField(item.productId, "quantity", Number(e.target.value) || 1)
                                    }
                                    className="w-16 rounded-lg border px-2 py-1 text-sm"
                                  />
                                </td>
                                <td className="px-3 py-2 align-top">
                                  <input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={item.monthlyValue ?? ""}
                                    onChange={(e) =>
                                      updateProductField(
                                        item.productId,
                                        "monthlyValue",
                                        e.target.value ? Number(e.target.value) : null,
                                      )
                                    }
                                    className="w-28 rounded-lg border px-2 py-1 text-sm"
                                    placeholder="Opcional"
                                  />
                                </td>
                                <td className="px-3 py-2 align-top">
                                  <input
                                    value={item.note ?? ""}
                                    onChange={(e) => updateProductField(item.productId, "note", e.target.value)}
                                    className="w-full rounded-lg border px-2 py-1 text-sm"
                                    placeholder="Observação"
                                  />
                                </td>
                                <td className="px-3 py-2 align-top">
                                  <button
                                    onClick={() => removeProduct(item.productId)}
                                    className="text-xs font-semibold text-red-600 hover:text-red-700"
                                  >
                                    Remover
                                  </button>
                                </td>
                              </tr>
                            ))}
                            {leadProducts.length === 0 ? (
                              <tr>
                                <td className="px-3 py-3 text-sm text-slate-500" colSpan={5}>
                                  Nenhum produto no carrinho ainda. Adicione pelo catálogo ao lado.
                                </td>
                              </tr>
                            ) : null}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : activeTab === "atividades" ? (
            <div className="space-y-6 py-4">
              <form
                onSubmit={submitActivity}
                className="rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm"
              >
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs text-slate-600">Tipo de atividade</label>
                    <select
                      name="activityType"
                      value={form.activityType}
                      onChange={handleFormChange}
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                    >
                      {ACTIVITY_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-600">Canal</label>
                    <select
                      name="channel"
                      value={form.channel}
                      onChange={handleFormChange}
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                    >
                      {CHANNEL_OPTIONS.map((channel) => (
                        <option key={channel.value} value={channel.value}>
                          {channel.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-600">Resultado / palitagem</label>
                    <select
                      name="outcomeCode"
                      value={form.outcomeCode}
                      onChange={(e) => {
                        const selected = OUTCOME_OPTIONS.find((opt) => opt.code === e.target.value);
                        setForm((prev) => ({
                          ...prev,
                          outcomeCode: selected?.code ?? "",
                          outcomeLabel: selected?.label ?? "",
                        }));
                      }}
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                    >
                      <option value="">Selecione</option>
                      {OUTCOME_OPTIONS.map((opt) => (
                        <option key={opt.code} value={opt.code}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-600">Próximo contato (opcional)</label>
                    <input
                      type="datetime-local"
                      name="nextFollowUpAt"
                      value={form.nextFollowUpAt}
                      onChange={handleFormChange}
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-600">Próximo passo (texto curto)</label>
                    <input
                      name="nextStepNote"
                      value={form.nextStepNote}
                      onChange={handleFormChange}
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                      placeholder="Ex: Ligar semana que vem..."
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-600">Estágio após atividade</label>
                    <select
                      name="newStage"
                      value={form.newStage}
                      onChange={(e) => setForm((prev) => ({ ...prev, newStage: e.target.value as LeadStatusId }))}
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                    >
                      {LEAD_STATUS.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.title}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-600">Observação detalhada</label>
                  <textarea
                    name="note"
                    value={form.note}
                    onChange={handleFormChange}
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    rows={3}
                    required
                  />
                </div>
                {error ? <p className="text-sm text-red-600">{error}</p> : null}
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-semibold hover:bg-slate-800 disabled:opacity-60"
                  >
                    {saving ? "Salvando..." : "Salvar atividade"}
                  </button>
                </div>
              </form>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-slate-900">Timeline unificada</h3>
                  {(activitiesLoading || eventsLoading) ? (
                    <span className="text-xs text-slate-500">Carregando...</span>
                  ) : null}
                </div>
                <div className="space-y-4">
                  {timelineItems.map((item) => {
                    const payload = (item.payload ?? {}) as any;
                    return (
                      <div key={item.id} className="relative pl-6">
                        <span className="absolute left-0 top-2 h-3 w-3 rounded-full bg-slate-900" aria-hidden />
                        <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                          <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                            <div className="text-sm font-semibold text-slate-900">
                              {item.type === "STATUS" && "Mudança de status"}
                              {item.type === "NOTE" && "Atividade / Nota"}
                              {item.type === "ACTIVITY" && (payload.activityType || "Atividade")}
                              {item.type === "PHONE_VALIDATION" && "Validação de telefone"}
                              {item.type === "PHONE_UPDATE" && "Telefone adicionado/atualizado"}
                              {item.type === "CONTACT_UPDATE" && "Contato atualizado"}
                              {item.type === "PRODUCT_CART_UPDATE" && "Carrinho atualizado"}
                              {item.type === "OPEN" && "Ficha aberta"}
                              {![
                                "STATUS",
                                "NOTE",
                                "ACTIVITY",
                                "PHONE_VALIDATION",
                                "PHONE_UPDATE",
                                "CONTACT_UPDATE",
                                "PRODUCT_CART_UPDATE",
                                "OPEN",
                              ].includes(item.type) && item.type}
                            </div>
                            <div className="text-xs text-slate-500">{formatDate(item.createdAt, true)}</div>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-600">
                            {item.type === "STATUS" && (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5">
                                {stageLabel(payload.from)} → {stageLabel(payload.to)}
                              </span>
                            )}
                            {item.type === "PHONE_VALIDATION" && (
                              <span
                                className={`rounded-full px-2 py-0.5 ${
                                  payload.verdict === "good"
                                    ? "bg-emerald-100 text-emerald-700"
                                    : "bg-red-100 text-red-700"
                                }`}
                              >
                                {payload.verdict === "good" ? "Contato bom" : "Contato ruim"} ({payload.phone})
                              </span>
                            )}
                            {payload.outcomeLabel ? (
                              <span className="rounded-full bg-slate-100 px-2 py-0.5">{payload.outcomeLabel}</span>
                            ) : null}
                            {payload.nextFollowUpAt ? (
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5">
                                Próximo contato: {formatDate(payload.nextFollowUpAt, true)}
                              </span>
                            ) : null}
                            {payload.reason ? (
                              <span className="rounded-full bg-red-100 px-2 py-0.5">Motivo: {payload.reason}</span>
                            ) : null}
                          </div>
                          {payload.note ? (
                            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{payload.note}</p>
                          ) : null}
                          {payload.phone && item.type === "PHONE_VALIDATION" && payload.reason ? (
                            <p className="mt-1 text-xs text-slate-600">Detalhe: {payload.reason}</p>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                  {timelineItems.length === 0 && !(activitiesLoading || eventsLoading) ? (
                    <p className="text-sm text-slate-500">Nenhum evento registrado ainda.</p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase text-slate-500">Enriquecimento online</p>
                  <p className="text-sm text-slate-600">
                    Busque dados na internet e aceite/recuse sugestões para este lead.
                  </p>
                </div>
                <button
                  onClick={fetchSuggestions}
                  disabled={suggestionsLoading}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {suggestionsLoading ? "Buscando..." : "Buscar dados na internet"}
                </button>
              </div>
              {suggestionsError ? <p className="text-sm text-red-600">{suggestionsError}</p> : null}
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="space-y-3">
                  {suggestionsLoading ? <p className="text-sm text-slate-600">Carregando sugestões...</p> : null}
                  {suggestions.length === 0 && !suggestionsLoading ? (
                    <p className="text-sm text-slate-500">
                      Nenhuma sugestão disponível. Clique em &ldquo;Buscar dados na internet&rdquo;.
                    </p>
                  ) : null}
                  {suggestions.map((suggestion) => (
                    <div
                      key={suggestion.id}
                      className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 md:flex-row md:items-center md:justify-between"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                          <span className="rounded-full bg-slate-100 px-2 py-0.5">{suggestion.type}</span>
                          <span className="text-slate-500">Fonte: {suggestion.source}</span>
                        </div>
                        <p className="text-sm font-semibold text-slate-900">{suggestion.value}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => acceptSuggestion(suggestion)}
                          className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
                        >
                          Aceitar
                        </button>
                        <button
                          onClick={() => rejectSuggestion(suggestion)}
                          className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                        >
                          Rejeitar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LeadCard({
  lead,
  onClick,
}: {
  lead: Lead;
  onClick: () => void;
}) {
  const mainPhone = lead.telefone1 ?? lead.telefone ?? "Telefone não informado";
  const hasFollowUp = Boolean(lead.nextFollowUpAt);
  const followUpLabel = hasFollowUp ? formatDate(lead.nextFollowUpAt, true) : null;
  const documento = (lead.documento ?? lead.cnpj ?? "").toString();
  const statusColor: Record<LeadStatusId, string> = {
    NOVO: "bg-emerald-500",
    EM_CONTATO: "bg-amber-500",
    EM_NEGOCIACAO: "bg-blue-500",
    FECHADO: "bg-slate-500",
    PERDIDO: "bg-red-500",
  };
  const statusText: Record<LeadStatusId, string> = {
    NOVO: "NOVO",
    EM_CONTATO: "EM CONTATO",
    EM_NEGOCIACAO: "EM NEGOCIAÇÃO",
    FECHADO: "FECHADO",
    PERDIDO: "PERDIDO",
  };

  return (
    <div
      onClick={onClick}
      className="relative rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm hover:shadow-md transition cursor-pointer space-y-2"
    >
      <span
        className={`absolute right-2 top-2 h-2 w-2 rounded-full ${statusColor[lead.status] ?? "bg-slate-400"}`}
        aria-hidden
      />
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-900 leading-tight line-clamp-2">
            {lead.razaoSocial ?? lead.nomeFantasia ?? "Sem empresa"}
          </p>
          <p className="text-xs text-slate-500">
            {lead.vertical ?? "Vertical não informada"} •{" "}
            {lead.cidade || lead.estado ? `${lead.cidade ?? "-"}${lead.estado ? `/${lead.estado}` : ""}` : "Cidade não informada"}
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-700">
          {statusText[lead.status]}
        </span>
      </div>
      <div className="text-xs text-slate-600 space-y-1">
        <p className="font-medium text-slate-800">{mainPhone}</p>
        {lead.telefone2 ? <p className="text-[11px] text-slate-500">{lead.telefone2}</p> : null}
        {lead.telefone3 ? <p className="text-[11px] text-slate-500">{lead.telefone3}</p> : null}
        {documento ? <p className="text-[11px] text-slate-500">Doc: {documento}</p> : null}
        {lead.vlFatPresumido ? (
          <p className="text-[11px] text-slate-500">Faturamento: {lead.vlFatPresumido}</p>
        ) : null}
      </div>
      {hasFollowUp ? (
        <div className="rounded-lg bg-amber-50 px-2 py-1 text-[11px] text-amber-700">
          Próximo contato: {followUpLabel}
        </div>
      ) : null}
    </div>
  );
}

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
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);

  const loadLeads = useCallback(async () => {
    setLoading(true);
    setError("");
    if (viewerRole === "MASTER" && !consultantId) {
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
    if (viewerRole === "MASTER" && !consultantId) {
      setMetrics(null);
      return;
    }
    const params = new URLSearchParams();
    if (consultantId) params.set("consultantId", consultantId);
    if (campaignId) params.set("campaignId", campaignId);
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

  useEffect(() => {
    if (!selectedLead) return;
    const updated = leads.find((l) => l.id === selectedLead.id);
    if (updated) setSelectedLead(updated);
  }, [leads, selectedLead]);

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

  const summary = useMemo(
    () =>
      LEAD_STATUS.map((stage) => ({
        id: stage.id,
        title: stage.title,
        count: grouped[stage.id]?.length ?? 0,
      })),
    [grouped],
  );

  const handleStageChange = async (leadId: string, stage: LeadStatusId) => {
    let motivo: string | undefined;
    let observacao: string | undefined;
    if (stage === "PERDIDO") {
      const motivoPrompt =
        window.prompt(
          "Informe o motivo do perdido (ex: Telefone inválido, Não pertence à empresa, Empresa fechada, Sem interesse, Concorrência, Orçamento baixo, Ficou de ligar e sumiu, Outro):",
        ) || "";
      if (!motivoPrompt.trim()) return;
      motivo = motivoPrompt.trim();
      if (motivo.toLowerCase() === "outro") {
        const obs = window.prompt("Descreva o motivo:") || "";
        if (!obs.trim()) return;
        observacao = obs.trim();
      }
    }

    await fetch(`/api/leads/${leadId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: stage, motivo, observacao }),
    });
    await loadLeads();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-white p-3 shadow-sm flex flex-wrap gap-3">
        {summary.map((item) => (
          <div key={item.id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
            <span className="text-xs text-slate-500">{item.title}</span>
            <span className="text-lg font-semibold text-slate-900">{item.count}</span>
          </div>
        ))}
      </div>

      {metrics ? (
        <div className="rounded-xl border bg-white p-4 shadow-sm grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Leads totais</p>
            <p className="text-lg font-semibold">{metrics.totalLeads}</p>
            <p className="text-xs text-slate-500">Trabalhados: {metrics.workedLeads}</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Taxa de contato</p>
            <p className="text-lg font-semibold">{metrics.contactRate}%</p>
            <p className="text-xs text-slate-500">Não trabalhados: {metrics.notWorkedLeads}</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Taxa de negociação</p>
            <p className="text-lg font-semibold">{metrics.negotiationRate}%</p>
            <p className="text-xs text-slate-500">Atividades/lead: {metrics.avgActivities}</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs text-slate-500">Taxa de fechamento</p>
            <p className="text-lg font-semibold">{metrics.closeRate}%</p>
            <p className="text-xs text-slate-500">Follow-ups próximos 7d: {metrics.followUps}</p>
          </div>
        </div>
      ) : null}

      {error ? <div className="text-sm text-red-600">{error}</div> : null}
      {loading ? <div className="text-sm text-slate-600">Carregando...</div> : null}
      {viewerRole === "MASTER" && !consultantId ? (
        <div className="text-sm text-slate-600">Selecione um consultor para visualizar o board.</div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4">
        {LEAD_STATUS.map((stage) => (
          <div
            key={stage.id}
            className="rounded-xl border border-slate-200 bg-white/80 backdrop-blur p-3 flex flex-col gap-3 min-h-[240px]"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700">{stage.title}</h2>
              <span className="text-xs text-slate-400">{grouped[stage.id]?.length ?? 0}</span>
            </div>
            <div className="flex flex-col gap-2 overflow-y-auto max-h-[70vh] pr-1">
              {(grouped[stage.id] || []).map((lead) => (
                <LeadCard key={lead.id} lead={lead} onClick={() => setSelectedLead(lead)} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {selectedLead ? (
        <LeadDrawer
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
          onStageChange={handleStageChange}
          onActivitySaved={loadLeads}
        />
      ) : null}
    </div>
  );
}

export default function BoardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
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
    if (status === "authenticated" && session?.user.role === "CONSULTOR") {
      setSelectedConsultant(session.user.id);
    }
  }, [status, session, router]);

  useEffect(() => {
    if (status !== "authenticated" || !session?.user) return;
    if (session.user.role === "CONSULTOR") return;
    const sessionRole = session.user.role ?? "";
    const canSelectOtherConsultant = ["MASTER", "GERENTE_SENIOR", "GERENTE_NEGOCIOS"].includes(
      sessionRole,
    );
    const consultantFromQuery = searchParams.get("consultantId");
    const campaignFromQuery = searchParams.get("campaignId");
    if (consultantFromQuery && canSelectOtherConsultant) {
      setSelectedConsultant(consultantFromQuery);
    }
    if (campaignFromQuery) {
      setSelectedCampaign(campaignFromQuery);
    }
  }, [status, session, searchParams]);

  const loadConsultants = useCallback(async () => {
    const res = await fetch("/api/admin/users", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      const onlyConsultants = (data as typeof consultants).filter((u) => u.role === "CONSULTOR");
      setConsultants(onlyConsultants);
      if (!selectedConsultant && onlyConsultants.length > 0) {
        setSelectedConsultant(onlyConsultants[0].id);
      }
    }
  }, [selectedConsultant]);

  useEffect(() => {
    if (session?.user.role === "MASTER") {
      loadConsultants();
    }
  }, [session, loadConsultants]);

  if (status === "loading" || !session?.user) {
    return <div>Carregando...</div>;
  }

  const viewerRole = session.user.role as ViewerRole;

  return (
    <div className="relative space-y-4">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Board</p>
          <h1 className="text-2xl font-semibold">Esteira de leads</h1>
          <p className="text-sm text-slate-500">
            {session.user.name ?? session.user.email} • Perfil: {session.user.role}
          </p>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          {viewerRole === "MASTER" ? (
            <select
              value={selectedConsultant}
              onChange={(e) => setSelectedConsultant(e.target.value)}
              className="rounded-lg border px-3 py-2 text-sm"
            >
              <option value="">Selecione um consultor</option>
              {consultants.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.email})
                </option>
              ))}
            </select>
          ) : null}
          <select
            value={selectedCampaign}
            onChange={(e) => setSelectedCampaign(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm"
          >
            <option value="all">Todas as campanhas</option>
            {campaignOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name || c.id}
              </option>
            ))}
          </select>
          <button
            onClick={() => setRefreshSignal((prev) => prev + 1)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-100"
          >
            Atualizar
          </button>
        </div>
      </header>

      <ConsultantBoard
        viewerRole={viewerRole}
        consultantId={viewerRole === "CONSULTOR" ? session.user.id : selectedConsultant || undefined}
        campaignId={selectedCampaign}
        refreshSignal={refreshSignal}
        onCampaignsUpdate={setCampaignOptions}
        officeIds={session.user.officeIds}
      />
    </div>
  );
}
