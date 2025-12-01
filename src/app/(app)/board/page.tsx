"use client";

import React, { useEffect, useMemo, useState } from "react";
import { STAGES, StageId } from "@/constants/stages";
import { DISPOSITIONS } from "@/constants/dispositions";

type Lead = {
  _id: string;
  empresa: string;
  documento: string;
  vertical: string;
  telefone1?: string;
  telefone2?: string;
  telefone3?: string;
  stage: StageId;
  isWorked: boolean;
  campaign?: { _id: string; name: string };
  assignedTo?: { name: string; email: string };
  lastOutcomeLabel?: string;
};

type Activity = {
  _id: string;
  company: string;
  user: { name: string; email: string };
  kind: string;
  channel: string | null;
  stageBefore: StageId | null;
  stageAfter: StageId | null;
  outcomeLabel?: string;
  note: string;
  createdAt: string;
};

type ActivityFormState = {
  channel: string;
  disposition: string;
  note: string;
  newStage: StageId;
};

export default function BoardPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [activityForm, setActivityForm] = useState<ActivityFormState>({
    channel: "TELEFONE",
    disposition: "",
    note: "",
    newStage: "PROSPECCAO",
  });
  const [activitySaving, setActivitySaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadLeads();
  }, []);

  async function loadLeads() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/companies", { cache: "no-store" });
      if (!res.ok) {
        setError("Não foi possível carregar os leads.");
        setLoading(false);
        return;
      }
      const data = await res.json();
      setLeads(data);
    } catch (err) {
      console.error(err);
      setError("Erro ao buscar leads.");
    } finally {
      setLoading(false);
    }
  }

  async function loadActivities(leadId: string) {
    const res = await fetch(`/api/activities?companyId=${leadId}`, { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      setActivities(data);
    }
  }

  function onDragStart(e: React.DragEvent<HTMLDivElement>, leadId: string) {
    e.dataTransfer.setData("text/plain", leadId);
  }

  async function onDrop(e: React.DragEvent<HTMLDivElement>, stage: StageId) {
    e.preventDefault();
    const leadId = e.dataTransfer.getData("text/plain");
    if (!leadId) return;
    await updateLeadStage(leadId, stage);
  }

  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
  }

  async function updateLeadStage(leadId: string, stage: StageId) {
    await fetch(`/api/companies/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage }),
    });
    await loadLeads();
    if (selectedLead?._id === leadId) {
      setSelectedLead({ ...selectedLead, stage });
      setActivityForm((prev) => ({ ...prev, newStage: stage }));
    }
  }

  function openLead(lead: Lead) {
    setSelectedLead(lead);
    setActivityForm({
      channel: "TELEFONE",
      disposition: "",
      note: "",
      newStage: lead.stage,
    });
    loadActivities(lead._id);
  }

  async function submitActivity() {
    if (!selectedLead) return;
    setError("");
    setActivitySaving(true);
    const disposition = DISPOSITIONS.find((d) => d.code === activityForm.disposition);
    const res = await fetch("/api/activities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId: selectedLead._id,
        channel: activityForm.channel || null,
        outcomeCode: activityForm.disposition || undefined,
        outcomeLabel: disposition?.label,
        note: activityForm.note,
        newStage: activityForm.newStage,
      }),
    });
    if (!res.ok) {
      setError("Não foi possível registrar a atividade.");
      setActivitySaving(false);
      return;
    }
    setActivitySaving(false);
    setActivityForm((prev) => ({ ...prev, note: "" }));
    await loadActivities(selectedLead._id);
    await loadLeads();
  }

  const grouped = useMemo(() => {
    const map: Record<StageId, Lead[]> = {
      PROSPECCAO: [],
      QUALIFICACAO: [],
      REUNIAO: [],
      FECHAMENTO: [],
      GANHO: [],
      PERDIDO: [],
    };
    for (const lead of leads) {
      map[lead.stage]?.push(lead);
    }
    return map;
  }, [leads]);

  function stageLabel(stage?: StageId | null) {
    const label = STAGES.find((s) => s.id === stage)?.title;
    return label ?? "-";
  }

  return (
    <div className="relative">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Leads</p>
          <h1 className="text-2xl font-semibold">Board de Prospecção</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadLeads}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-100"
          >
            Atualizar
          </button>
        </div>
      </header>

      {error ? <div className="mb-4 text-red-600 text-sm">{error}</div> : null}
      {loading ? <div>Carregando...</div> : null}

      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {STAGES.map((stage) => (
          <div
            key={stage.id}
            onDragOver={onDragOver}
            onDrop={(e) => onDrop(e, stage.id)}
            className="rounded-xl border border-slate-200 bg-white/80 backdrop-blur p-3 flex flex-col gap-3 min-h-[200px]"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700">{stage.title}</h2>
              <span className="text-xs text-slate-400">
                {grouped[stage.id]?.length ?? 0}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {(grouped[stage.id] || []).map((lead) => (
                <div
                  key={lead._id}
                  draggable
                  onDragStart={(e) => onDragStart(e, lead._id)}
                  onClick={() => openLead(lead)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm cursor-grab active:cursor-grabbing hover:border-slate-300"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-sm">{lead.empresa}</p>
                    {!lead.isWorked ? (
                      <span className="h-2 w-2 rounded-full bg-red-500" title="Novo lead" />
                    ) : null}
                  </div>
                  <p className="text-xs text-slate-500">{lead.documento}</p>
                  <p className="text-xs text-slate-600">{lead.vertical}</p>
                  <p className="text-xs text-slate-500">
                    {lead.telefone1 || lead.telefone2 || lead.telefone3
                      ? [lead.telefone1, lead.telefone2, lead.telefone3]
                          .filter(Boolean)
                          .join(" / ")
                      : "Sem telefone"}
                  </p>
                  {lead.campaign?.name ? (
                    <p className="text-[11px] text-slate-400 mt-1">{lead.campaign.name}</p>
                  ) : null}
                  {lead.lastOutcomeLabel ? (
                    <p className="text-[11px] text-amber-700 mt-1">
                      Último retorno: {lead.lastOutcomeLabel}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {selectedLead ? (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex justify-end z-20">
          <div className="w-full md:w-[420px] bg-white h-full shadow-2xl border-l overflow-y-auto p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Lead</p>
                <h3 className="text-xl font-semibold">{selectedLead.empresa}</h3>
                <p className="text-sm text-slate-500">{selectedLead.documento}</p>
                <p className="text-xs text-slate-400 mt-1">
                  Campanha: {selectedLead.campaign?.name ?? "N/A"}
                </p>
              </div>
              <button
                className="text-sm text-slate-500 hover:text-slate-700"
                onClick={() => setSelectedLead(null)}
              >
                Fechar
              </button>
            </div>

            <div className="space-y-1 text-sm text-slate-700">
              <p>
                <span className="font-semibold">Vertical:</span> {selectedLead.vertical}
              </p>
              <p>
                <span className="font-semibold">Telefone(s):</span>{" "}
                {selectedLead.telefone1 || selectedLead.telefone2 || selectedLead.telefone3
                  ? [selectedLead.telefone1, selectedLead.telefone2, selectedLead.telefone3]
                      .filter(Boolean)
                      .join(" / ")
                  : "Sem telefone"}
              </p>
              <p>
                <span className="font-semibold">Responsável:</span>{" "}
                {selectedLead.assignedTo?.name ?? "N/A"}
              </p>
              <p>
                <span className="font-semibold">Etapa:</span>{" "}
                {STAGES.find((s) => s.id === selectedLead.stage)?.title}
              </p>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-semibold text-slate-800">Registrar atividade</p>
              <div className="space-y-2">
                <label className="text-xs text-slate-600">Canal</label>
                <select
                  value={activityForm.channel}
                  onChange={(e) => setActivityForm({ ...activityForm, channel: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                >
                  <option value="TELEFONE">Telefone</option>
                  <option value="WHATSAPP">WhatsApp</option>
                  <option value="EMAIL">E-mail</option>
                  <option value="VISITA">Visita</option>
                  <option value="OUTRO">Outro</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs text-slate-600">Mover para</label>
                <select
                  value={activityForm.newStage}
                  onChange={(e) =>
                    setActivityForm({ ...activityForm, newStage: e.target.value as StageId })
                  }
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                >
                  {STAGES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs text-slate-600">Palitagem</label>
                <select
                  value={activityForm.disposition}
                  onChange={(e) =>
                    setActivityForm({ ...activityForm, disposition: e.target.value })
                  }
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Selecionar</option>
                  {DISPOSITIONS.map((d) => (
                    <option key={d.code} value={d.code}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs text-slate-600">Observação</label>
                <textarea
                  value={activityForm.note}
                  onChange={(e) => setActivityForm({ ...activityForm, note: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  rows={3}
                  required
                />
              </div>
              <button
                disabled={activitySaving || !activityForm.note}
                onClick={submitActivity}
                className="w-full rounded-lg bg-slate-900 text-white py-2 text-sm font-semibold hover:bg-slate-800 disabled:opacity-50"
              >
                {activitySaving ? "Salvando..." : "Registrar atividade"}
              </button>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-800">Histórico</p>
              <div className="space-y-3">
                {activities.length === 0 ? (
                  <p className="text-xs text-slate-500">Nenhuma atividade ainda.</p>
                ) : null}
                {activities.map((activity) => (
                  <div
                    key={activity._id}
                    className="rounded-lg border border-slate-200 p-3 bg-slate-50"
                  >
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>{new Date(activity.createdAt).toLocaleString()}</span>
                      <span>{activity.user?.name}</span>
                    </div>
                    <p className="text-sm font-medium text-slate-800 mt-1">
                      {activity.outcomeLabel ?? activity.kind}
                    </p>
                    <p className="text-xs text-slate-600">Canal: {activity.channel ?? "N/A"}</p>
                    <p className="text-xs text-slate-600">
                      {stageLabel(activity.stageBefore as StageId)} →{" "}
                      {stageLabel(activity.stageAfter as StageId)}
                    </p>
                    <p className="text-sm text-slate-700 mt-2 whitespace-pre-line">
                      {activity.note}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
