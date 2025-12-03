"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  FormEvent,
  ChangeEvent,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { LEAD_STATUS, LeadStatusId } from "@/constants/leadStatus";

type ViewerRole = "MASTER" | "OWNER" | "CONSULTOR";

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
  vertical?: string | null;
  endereco?: string | null;
  emails?: string[];
  telefones?: { rotulo: string; valor: string }[];
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
  const [activeTab, setActiveTab] = useState<"dados" | "atividades">("dados");
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
  }, [lead.id, lead.status, lead.nextFollowUpAt, lead.nextStepNote, loadActivities, lead.site, lead.emails, lead.contatoPrincipal]);

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
  }

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-3xl bg-white shadow-2xl h-full overflow-y-auto">
        <div className="sticky top-0 z-10 bg-white border-b px-6 py-4 flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Lead</p>
            <h2 className="text-xl font-semibold text-slate-900">
              {lead.razaoSocial ?? lead.nomeFantasia ?? "Sem empresa"}
            </h2>
            <p className="text-sm text-slate-500">Estágio: {stageLabel(lead.status)}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-100"
          >
            Fechar
          </button>
        </div>

        <div className="px-6 pt-4">
          <div className="flex gap-2 border-b pb-3">
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
          </div>

          {activeTab === "dados" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
                <p className="text-xs uppercase text-slate-500">Empresa</p>
                <p className="text-lg font-semibold text-slate-900">
                  {lead.razaoSocial ?? lead.nomeFantasia ?? "Sem empresa"}
                </p>
                <p className="text-sm text-slate-600">Documento: {lead.cnpj ?? "-"}</p>
                <p className="text-sm text-slate-600">Vertical: {lead.vertical ?? "-"}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
                <p className="text-xs uppercase text-slate-500">Localização</p>
                <p className="text-sm text-slate-700">
                  {lead.cidade ?? "-"} {lead.estado ? `/ ${lead.estado}` : ""}
                </p>
                <p className="text-sm text-slate-600">Endereço: {lead.endereco ?? "-"}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                <p className="text-xs uppercase text-slate-500">Telefones</p>
                {[
                  ...(lead.telefones ?? []),
                  ...[lead.telefone1, lead.telefone2, lead.telefone3, lead.telefone]
                    .filter(Boolean)
                    .map((p) => ({ rotulo: "Telefone", valor: p as string })),
                ].length === 0 ? <p className="text-sm text-slate-600">Telefone não informado</p> : null}
                {[
                  ...(lead.telefones ?? []),
                  ...[lead.telefone1, lead.telefone2, lead.telefone3, lead.telefone]
                    .filter(Boolean)
                    .map((p) => ({ rotulo: "Telefone", valor: p as string })),
                ].map((phone, idx) => (
                  <a
                    key={`${phone.valor}-${idx}`}
                    href={`tel:${phone.valor}`}
                    className="block text-sm text-slate-800 hover:underline"
                  >
                    {phone.rotulo}: {phone.valor}
                  </a>
                ))}
                <div className="flex flex-col gap-1 pt-2">
                  <div className="flex gap-2">
                    <input
                      className="flex-1 rounded-lg border px-2 py-1 text-sm"
                      placeholder="Rótulo"
                      value={newPhone.rotulo}
                      onChange={(e) => setNewPhone((prev) => ({ ...prev, rotulo: e.target.value }))}
                    />
                    <input
                      className="flex-1 rounded-lg border px-2 py-1 text-sm"
                      placeholder="Telefone"
                      value={newPhone.valor}
                      onChange={(e) => setNewPhone((prev) => ({ ...prev, valor: e.target.value }))}
                    />
                  </div>
                  <button
                    onClick={addPhone}
                    disabled={savingPhone}
                    className="self-start rounded-lg bg-slate-900 text-white px-3 py-1 text-xs font-semibold hover:bg-slate-800 disabled:opacity-60"
                  >
                    {savingPhone ? "Salvando..." : "Adicionar telefone"}
                  </button>
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                <p className="text-xs uppercase text-slate-500">Campanha e estágio</p>
                <p className="text-sm text-slate-700">Campanha: {lead.campanha?.nome ?? "-"}</p>
                <label className="text-xs text-slate-500">Mudar estágio</label>
                <select
                  value={lead.status}
                  onChange={(e) => onStageChange(lead.id, e.target.value as LeadStatusId)}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                >
                  {LEAD_STATUS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-500">Criado em {formatDate(lead.createdAt)}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                <p className="text-xs uppercase text-slate-500">Contatos & Canais</p>
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
                <div className="space-y-1">
                  <label className="text-xs text-slate-600">Contato principal</label>
                  <input
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    placeholder="Nome do contato"
                  />
                </div>
                <button
                  onClick={saveContactFields}
                  className="rounded-lg bg-slate-900 text-white px-3 py-2 text-sm font-semibold hover:bg-slate-800"
                >
                  Salvar contatos
                </button>
              </div>
            </div>
          ) : (
            <div className="py-4 space-y-6">
              <form
                onSubmit={submitActivity}
                className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3 shadow-sm"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                  <h3 className="text-lg font-semibold text-slate-900">Timeline</h3>
                  {activitiesLoading ? <span className="text-xs text-slate-500">Carregando...</span> : null}
                </div>
                <div className="space-y-4">
                  {activities.map((activity) => (
                    <div key={activity.id} className="relative pl-6">
                      <span className="absolute left-0 top-2 h-3 w-3 rounded-full bg-slate-900" aria-hidden />
                      <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                        <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                          <div className="text-sm font-semibold text-slate-900">
                            {activity.activityType}
                            {activity.channel ? (
                              <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">
                                {CHANNEL_OPTIONS.find((c) => c.value === activity.channel)?.label ?? activity.channel}
                              </span>
                            ) : null}
                          </div>
                          <div className="text-xs text-slate-500">
                            {formatDate(activity.createdAt, true)} •{" "}
                            {activity.user?.name ?? activity.user?.email ?? "Usuário"}
                          </div>
                        </div>
                        <div className="mt-1 text-xs text-slate-600 flex flex-wrap gap-2">
                          {activity.stageBefore ? (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5">
                              {stageLabel(activity.stageBefore)} →{" "}
                              {stageLabel(activity.stageAfter ?? activity.stageBefore)}
                            </span>
                          ) : null}
                          {activity.outcomeLabel ? (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5">
                              {activity.outcomeLabel}
                            </span>
                          ) : null}
                          {activity.nextFollowUpAt ? (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5">
                              Próximo contato: {formatDate(activity.nextFollowUpAt, true)}
                            </span>
                          ) : null}
                          {activity.nextStepNote ? (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5">
                              Próximo passo: {activity.nextStepNote}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-2 text-sm text-slate-800 whitespace-pre-wrap">{activity.note}</p>
                      </div>
                    </div>
                  ))}
                  {activities.length === 0 && !activitiesLoading ? (
                    <p className="text-sm text-slate-500">Nenhuma atividade registrada ainda.</p>
                  ) : null}
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
  onStageChange,
}: {
  lead: Lead;
  onClick: () => void;
  onStageChange: (leadId: string, stage: LeadStatusId) => Promise<void>;
}) {
  const mainPhone = lead.telefone1 ?? lead.telefone ?? "Telefone não informado";
  const hasFollowUp = Boolean(lead.nextFollowUpAt);
  const followUpLabel = hasFollowUp ? formatDate(lead.nextFollowUpAt, true) : null;

  return (
    <div
      onClick={onClick}
      className="relative rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm hover:shadow-md transition cursor-pointer space-y-2"
    >
      {!lead.isWorked ? <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-emerald-500" aria-hidden /> : null}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-900 leading-tight">
            {lead.razaoSocial ?? lead.nomeFantasia ?? "Sem empresa"}
          </p>
          <p className="text-xs text-slate-500">{lead.vertical ?? "Vertical não informada"}</p>
        </div>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">
          {stageLabel(lead.status)}
        </span>
      </div>
      <div className="text-xs text-slate-600 space-y-1">
        <p>
          {lead.cidade ?? "-"} {lead.estado ? `/ ${lead.estado}` : ""}
        </p>
        <p className="font-medium text-slate-800">{mainPhone}</p>
        {lead.telefone2 ? <p className="text-[11px] text-slate-500">{lead.telefone2}</p> : null}
        {lead.telefone3 ? <p className="text-[11px] text-slate-500">{lead.telefone3}</p> : null}
        {lead.cnpj ? <p className="text-[11px] text-slate-500">Doc: {lead.cnpj}</p> : null}
      </div>
      {hasFollowUp ? (
        <div className="rounded-lg bg-amber-50 px-2 py-1 text-[11px] text-amber-700">
          Próximo contato: {followUpLabel}
        </div>
      ) : null}
      <div className="pt-2 border-t border-slate-100">
        <select
          value={lead.status}
          onChange={(e) => onStageChange(lead.id, e.target.value as LeadStatusId)}
          onClick={(e) => e.stopPropagation()}
          className="w-full rounded-lg border px-2 py-1 text-xs"
        >
          {LEAD_STATUS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function ConsultantBoard({
  viewerRole,
  consultantId,
  campaignId,
  refreshSignal,
  onCampaignsUpdate,
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
  }, [viewerRole, consultantId, campaignId, onCampaignsUpdate]);

  const loadMetrics = useCallback(async () => {
    if (viewerRole === "MASTER" && !consultantId) {
      setMetrics(null);
      return;
    }
    const params = new URLSearchParams();
    if (consultantId) params.set("consultantId", consultantId);
    if (campaignId) params.set("campaignId", campaignId);
    const res = await fetch(`/api/consultor/metrics?${params.toString()}`, { cache: "no-store" });
    if (res.ok) {
      setMetrics(await res.json());
    }
  }, [viewerRole, consultantId, campaignId]);

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
    await fetch(`/api/consultor/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: stage }),
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
                <LeadCard
                  key={lead.id}
                  lead={lead}
                  onClick={() => setSelectedLead(lead)}
                  onStageChange={handleStageChange}
                />
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
    const consultantFromQuery = searchParams.get("consultantId");
    const campaignFromQuery = searchParams.get("campaignId");
    if (consultantFromQuery) {
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
      />
    </div>
  );
}
