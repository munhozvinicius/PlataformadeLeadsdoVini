import React, { useEffect, useMemo, useState, useCallback } from "react";
import { LEAD_STATUS } from "@/constants/leadStatus";
import { LeadCardProps } from "./LeadCard";

type LeadDetail = LeadCardProps["lead"] & {
  emails?: string[];
  telefones?: { rotulo: string; valor: string }[];
  vertical?: string | null;
  cidade?: string | null;
  estado?: string | null;
  endereco?: string | null;
  origem?: string | null;
  site?: string | null;
  contatoPrincipal?: { nome?: string; cargo?: string; telefone?: string; email?: string };
  externalData?: Record<string, unknown> | null;
};

type LeadNote = {
  id: string;
  tipo: string;
  conteudo: string;
  createdAt: string;
  user?: { name?: string; email?: string };
};

type LeadLoss = {
  id: string;
  motivo: string;
  justificativa: string;
  createdAt: string;
  user?: { name?: string; email?: string };
};

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
  const [tab, setTab] = useState<"dados" | "notas" | "perda" | "externo">("dados");
  const [notes, setNotes] = useState<LeadNote[]>([]);
  const [noteText, setNoteText] = useState("");
  const [noteTipo, setNoteTipo] = useState("anotacao");
  const [savingNote, setSavingNote] = useState(false);
  const [losses, setLosses] = useState<LeadLoss[]>([]);
  const [lossMotivo, setLossMotivo] = useState<string>(lossMotivos[0]);
  const [lossJust, setLossJust] = useState("");
  const [savingLoss, setSavingLoss] = useState(false);
  const [externalLoading, setExternalLoading] = useState(false);
  const [externalData, setExternalData] = useState<Record<string, unknown> | null>(lead.externalData ?? null);

  const phones = useMemo(
    () =>
      [
        ...(lead.telefones ?? []),
        ...[lead.telefone1, lead.telefone2, lead.telefone3]
          .filter(Boolean)
          .map((p) => ({ rotulo: "Telefone", valor: p as string })),
      ].filter(Boolean),
    [lead.telefones, lead.telefone1, lead.telefone2, lead.telefone3],
  );

  const loadNotes = useCallback(async () => {
    const res = await fetch(`/api/lead-notes?leadId=${lead.id}`, { cache: "no-store" });
    if (res.ok) setNotes(await res.json());
  }, [lead.id]);
  const loadLosses = useCallback(async () => {
    const res = await fetch(`/api/lead-losses?leadId=${lead.id}`, { cache: "no-store" });
    if (res.ok) setLosses(await res.json());
  }, [lead.id]);

  useEffect(() => {
    loadNotes();
    loadLosses();
  }, [lead.id, loadLosses, loadNotes]);

  async function saveNote() {
    if (!noteText.trim()) return;
    setSavingNote(true);
    await fetch("/api/lead-notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId: lead.id, tipo: noteTipo, conteudo: noteText }),
    });
    setNoteText("");
    setSavingNote(false);
    await loadNotes();
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
    const res = await fetch(`/api/leads/enrich?id=${lead.id}`, { method: "POST" });
    setExternalLoading(false);
    if (res.ok) {
      const data = await res.json();
      setExternalData(data);
      await onRefresh();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-5xl bg-white h-full overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Ficha do cliente</p>
            <h2 className="text-xl font-semibold text-slate-900">
              {lead.nomeFantasia ?? lead.razaoSocial ?? "Sem empresa"}
            </h2>
            <p className="text-sm text-slate-500">
              Estágio: {LEAD_STATUS.find((s) => s.id === lead.status)?.title ?? lead.status} • Campanha:{" "}
              {lead.campanha?.nome ?? "-"}
            </p>
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
              onClick={() => setTab("dados")}
              className={`rounded-md px-3 py-2 text-sm font-medium ${
                tab === "dados" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              Dados da Empresa
            </button>
            <button
              onClick={() => setTab("notas")}
              className={`rounded-md px-3 py-2 text-sm font-medium ${
                tab === "notas" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              Anotações de Trabalho
            </button>
            <button
              onClick={() => setTab("perda")}
              className={`rounded-md px-3 py-2 text-sm font-medium ${
                tab === "perda" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              Palitagem / Perda
            </button>
            <button
              onClick={() => setTab("externo")}
              className={`rounded-md px-3 py-2 text-sm font-medium ${
                tab === "externo" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              Informações Externas (beta)
            </button>
          </div>

          {tab === "dados" ? (
            <div className="py-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-lg border bg-slate-50 p-3">
                  <p className="text-xs uppercase text-slate-500">Dados cadastrais</p>
                  <p className="text-sm font-semibold">{lead.razaoSocial ?? "Razão Social não informada"}</p>
                  <p className="text-sm text-slate-600">Fantasia: {lead.nomeFantasia ?? "-"}</p>
                  <p className="text-sm text-slate-600">Documento: {lead.cnpj ?? "—"}</p>
                  <p className="text-sm text-slate-600">Vertical: {lead.vertical ?? "—"}</p>
                  <p className="text-sm text-slate-600">Origem: {lead.origem ?? "-"}</p>
                </div>
                <div className="rounded-lg border bg-slate-50 p-3">
                  <p className="text-xs uppercase text-slate-500">Localização</p>
                  <p className="text-sm text-slate-600">
                    {lead.cidade ?? "-"} {lead.estado ? `/ ${lead.estado}` : ""}
                  </p>
                  <p className="text-sm text-slate-600">Endereço: {lead.endereco ?? "-"}</p>
                </div>
                <div className="rounded-lg border bg-slate-50 p-3 space-y-2">
                  <p className="text-xs uppercase text-slate-500">Telefones</p>
                  {phones.length === 0 ? <p className="text-sm text-slate-600">Nenhum telefone</p> : null}
                  {phones.map((p, idx) => (
                    <p key={`${p.valor}-${idx}`} className="text-sm text-slate-700">
                      {p.rotulo}: {p.valor}
                    </p>
                  ))}
                </div>
                <div className="rounded-lg border bg-slate-50 p-3 space-y-2">
                  <p className="text-xs uppercase text-slate-500">Contatos & Canais</p>
                  <p className="text-sm text-slate-700">Site: {lead.site ?? "-"}</p>
                  <p className="text-sm text-slate-700">Email: {(lead.emails && lead.emails[0]) || "-"}</p>
                  <p className="text-sm text-slate-700">
                    Contato: {lead.contatoPrincipal?.nome ?? "-"} {lead.contatoPrincipal?.telefone ?? ""}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {tab === "notas" ? (
            <div className="py-4 space-y-4">
              <div className="rounded-lg border bg-slate-50 p-3 space-y-2">
                <p className="text-xs uppercase text-slate-500">Nova anotação</p>
                <div className="flex flex-wrap gap-2">
                  <select
                    value={noteTipo}
                    onChange={(e) => setNoteTipo(e.target.value)}
                    className="rounded-lg border px-3 py-2 text-sm"
                  >
                    <option value="voz">Voz</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="email">Email</option>
                    <option value="reuniao">Reunião</option>
                    <option value="objeção">Objeção</option>
                    <option value="follow-up">Follow-up</option>
                    <option value="anotacao">Anotação</option>
                  </select>
                  <textarea
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    rows={3}
                    placeholder="Descreva a interação"
                  />
                  <button
                    onClick={saveNote}
                    disabled={savingNote}
                    className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-semibold hover:bg-slate-800 disabled:opacity-60"
                  >
                    {savingNote ? "Salvando..." : "Adicionar anotação"}
                  </button>
                </div>
              </div>
              <div className="space-y-3">
                {notes.map((n) => (
                  <div key={n.id} className="rounded-lg border bg-white p-3 shadow-sm">
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>{n.tipo}</span>
                      <span>
                        {n.user?.name ?? n.user?.email ?? "Usuário"} •{" "}
                        {new Date(n.createdAt).toLocaleString("pt-BR")}
                      </span>
                    </div>
                    <p className="text-sm text-slate-800 mt-1 whitespace-pre-wrap">{n.conteudo}</p>
                  </div>
                ))}
                {notes.length === 0 ? <p className="text-sm text-slate-600">Nenhuma anotação ainda.</p> : null}
              </div>
            </div>
          ) : null}

          {tab === "perda" ? (
            <div className="py-4 space-y-4">
              <div className="rounded-lg border bg-slate-50 p-3 space-y-2">
                <p className="text-xs uppercase text-slate-500">Registrar perda</p>
                <select
                  value={lossMotivo}
                  onChange={(e) => setLossMotivo(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
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
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  rows={3}
                  placeholder="Justifique a perda"
                  required
                />
                <button
                  onClick={saveLoss}
                  disabled={savingLoss}
                  className="rounded-lg bg-red-600 text-white px-4 py-2 text-sm font-semibold hover:bg-red-500 disabled:opacity-60"
                >
                  {savingLoss ? "Salvando..." : "Marcar como perdido"}
                </button>
              </div>
              <div className="space-y-3">
                {losses.map((l) => (
                  <div key={l.id} className="rounded-lg border bg-white p-3 shadow-sm">
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>{l.motivo}</span>
                      <span>
                        {l.user?.name ?? l.user?.email ?? "Usuário"} •{" "}
                        {new Date(l.createdAt).toLocaleString("pt-BR")}
                      </span>
                    </div>
                    <p className="text-sm text-slate-800 mt-1 whitespace-pre-wrap">{l.justificativa}</p>
                  </div>
                ))}
                {losses.length === 0 ? <p className="text-sm text-slate-600">Nenhum registro de perda.</p> : null}
              </div>
            </div>
          ) : null}

          {tab === "externo" ? (
            <div className="py-4 space-y-3">
              <p className="text-sm text-slate-700">
                Beta: coleta leve de dados públicos. Substitua por integrações reais (Google, LinkedIn, ReceitaWS, etc).
              </p>
              <button
                onClick={runEnrichment}
                disabled={externalLoading}
                className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-semibold hover:bg-slate-800 disabled:opacity-60"
              >
                {externalLoading ? "Buscando..." : "Buscar informações na Internet (Beta)"}
              </button>
              <pre className="rounded-lg border bg-slate-50 p-3 text-xs whitespace-pre-wrap">
                {externalData ? JSON.stringify(externalData, null, 2) : "Nenhum dado coletado ainda."}
              </pre>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
