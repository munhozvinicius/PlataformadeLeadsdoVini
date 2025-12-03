"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { zipSync } from "fflate";

type Campaign = {
  id: string;
  nome: string;
  descricao?: string;
  totalBruto?: number;
  atribuidos?: number;
  restantes?: number;
  consultoresReceberam?: number;
  createdAt?: string;
};

type ImportBatch = {
  id: string;
  nomeArquivoOriginal: string;
  campaignId: string;
  campaignName: string;
  totalLeads: number;
  createdAt: string;
  importedLeads?: number;
  attributedLeads?: number;
  notAttributedLeads?: number;
  duplicatedLeads?: number;
};

type User = { id: string; name: string; email: string; role: string };

export default function ImportPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [newCampaignName, setNewCampaignName] = useState("");
  const [newCampaignDescription, setNewCampaignDescription] = useState("");
  const [newCampaignObjective, setNewCampaignObjective] = useState("");
  const [newCampaignVertical, setNewCampaignVertical] = useState("");
  const [assignedUser, setAssignedUser] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [campaignToDelete, setCampaignToDelete] = useState<Campaign | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [batchToDelete, setBatchToDelete] = useState<ImportBatch | null>(null);
  const [assignmentType, setAssignmentType] = useState<"none" | "single" | "multi">("single");
  const [multiConsultants, setMultiConsultants] = useState<string[]>([]);

  useEffect(() => {
    if (status === "authenticated" && session?.user.role !== "MASTER") {
      router.replace("/board");
    }
  }, [status, session, router]);

  useEffect(() => {
    loadCampaigns();
    loadUsers();
    loadBatches();
  }, []);

  const consultants = useMemo(() => users.filter((u) => u.role === "CONSULTOR"), [users]);

  async function loadCampaigns() {
    const res = await fetch("/api/campanhas/summary", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      setCampaigns(data);
    }
  }

  async function loadBatches() {
    const res = await fetch("/api/admin/import-batches", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      setBatches(data);
    }
  }

  async function loadUsers() {
    const res = await fetch("/api/admin/users", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      setUsers(data);
    }
  }

  async function deleteCampaign() {
    if (!campaignToDelete) return;
    setDeleteError("");
    setDeleteLoading(true);
    const res = await fetch(`/api/campanhas/${campaignToDelete.id}`, { method: "DELETE" });
    setDeleteLoading(false);
    if (!res.ok) {
      setDeleteError("Não foi possível excluir esta base.");
      return;
    }
    const json = await res.json();
    setMessage(
      `Base removida. Leads excluídos: ${json.deletedCompaniesCount ?? 0}. Atividades: ${
        json.deletedActivitiesCount ?? 0
      }.`,
    );
    if (campaignId === campaignToDelete.id) {
      setCampaignId("");
    }
    setCampaignToDelete(null);
    await loadCampaigns();
  }

  async function createCampaign() {
    if (!newCampaignName) return;
    const res = await fetch("/api/campanhas/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nome: newCampaignName,
        descricao: newCampaignDescription,
        objetivo: newCampaignObjective,
        vertical: newCampaignVertical,
      }),
    });
    if (res.ok) {
      setNewCampaignName("");
      setNewCampaignDescription("");
      await loadCampaigns();
      const json = await res.json();
      setCampaignId(json.id);
    }
  }

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    if (!assignedUser || !file) {
      setMessage("Selecione consultor e arquivo. Campanha é obrigatória (crie ou escolha).");
      return;
    }

    const buffer = await file.arrayBuffer();
    // Compacta o arquivo para reduzir tamanho da requisição e evitar 413.
    const zipped = zipSync({ [file.name]: new Uint8Array(buffer) });
    const zippedArray = new Uint8Array(zipped);

    const formData = new FormData();
    formData.append(
      "file",
      new Blob([zippedArray], { type: "application/zip" }),
      `${file.name}.zip`,
    );
    formData.append("compressed", "true");
    if (campaignId) formData.append("campanhaId", campaignId);
    if (!campaignId && newCampaignName) formData.append("campanhaNome", newCampaignName);
    formData.append("consultorId", assignedUser);
    formData.append("assignmentType", assignmentType);
    if (assignmentType === "multi") {
      multiConsultants.forEach((id) => formData.append("multiConsultants[]", id));
    }

    setLoading(true);
    const res = await fetch("/api/campanhas/import", {
      method: "POST",
      body: formData,
    });
    setLoading(false);
    if (!res.ok) {
      setMessage("Erro ao importar planilha.");
      return;
    }
    const json = await res.json();
    setMessage(
      `Importação concluída: ${json.importedLeads} criados, ${json.duplicatedLeads} duplicados, atribuídos: ${json.attributedLeads}, em estoque: ${json.notAttributedLeads}.`
    );
    await loadCampaigns();
    await loadBatches();
  }

  async function deleteBatch() {
    if (!batchToDelete) return;
    setDeleteError("");
    setDeleteLoading(true);
    const res = await fetch(`/api/admin/import-batches/${batchToDelete.id}`, { method: "DELETE" });
    setDeleteLoading(false);
    if (!res.ok) {
      setDeleteError("Não foi possível excluir esta base.");
      return;
    }
    setBatchToDelete(null);
    await loadCampaigns();
    await loadBatches();
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Master</p>
        <h1 className="text-2xl font-semibold text-slate-900">Importar Leads</h1>
        <p className="text-sm text-slate-500">
          Suba a planilha `base_com_vertical.xlsx`, escolha campanha e consultor para importar os
          leads.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-xl border bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-3">Importação</h2>
          <form className="space-y-3" onSubmit={handleImport}>
            <div className="space-y-1">
              <label className="text-xs text-slate-600">Campanha</label>
              <select
                value={campaignId}
                onChange={(e) => setCampaignId(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Selecione</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-600">Atribuir para consultor</label>
              <select
                value={assignedUser}
                onChange={(e) => setAssignedUser(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Selecione</option>
                {consultants.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.email})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-600">Tipo de atribuição</label>
              <select
                value={assignmentType}
                onChange={(e) => setAssignmentType(e.target.value as "none" | "single" | "multi")}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              >
                <option value="none">Não atribuir (estoque da campanha)</option>
                <option value="single">Atribuir tudo para um consultor</option>
                <option value="multi">Distribuir igualmente entre consultores</option>
              </select>
              {assignmentType === "multi" ? (
                <select
                  multiple
                  value={multiConsultants}
                  onChange={(e) =>
                    setMultiConsultants(Array.from(e.target.selectedOptions).map((opt) => opt.value))
                  }
                  className="w-full border rounded-lg px-3 py-2 text-sm h-32"
                >
                  {consultants.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.email})
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-600">Arquivo Excel</label>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="w-full text-sm"
              />
              <p className="text-xs text-slate-400">
                O arquivo é compactado em ZIP automaticamente antes do envio para evitar limites de
                tamanho.
              </p>
            </div>
            {message ? <div className="text-sm text-slate-700">{message}</div> : null}
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-semibold hover:bg-slate-800 disabled:opacity-50"
            >
              {loading ? "Importando..." : "Importar leads"}
            </button>
          </form>
        </div>

        <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">Criar campanha</h2>
          <div className="space-y-2">
            <div className="space-y-1">
              <label className="text-xs text-slate-600">Nome</label>
              <input
                value={newCampaignName}
                onChange={(e) => setNewCampaignName(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-600">Descrição</label>
              <textarea
                value={newCampaignDescription}
                onChange={(e) => setNewCampaignDescription(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
                rows={2}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-600">Objetivo</label>
              <input
                value={newCampaignObjective}
                onChange={(e) => setNewCampaignObjective(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-600">Vertical</label>
              <input
                value={newCampaignVertical}
                onChange={(e) => setNewCampaignVertical(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <button
              onClick={createCampaign}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-100"
            >
              Salvar campanha
            </button>
          </div>
          <p className="text-xs text-slate-500">
            Crie a campanha primeiro, depois selecione-a para subir a planilha.
          </p>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900 mb-3">Campanhas (estoque)</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {campaigns.map((c) => (
            <div key={c.id} className="border rounded-lg p-3 bg-slate-50">
              <p className="font-semibold text-sm">{c.nome}</p>
              <p className="text-xs text-slate-500">{c.descricao ?? ""}</p>
              <div className="text-xs text-slate-600 mt-2 space-y-1">
                <p>Criada em: {c.createdAt ? new Date(c.createdAt).toLocaleDateString("pt-BR") : "-"}</p>
                <p>Total bruto: {c.totalBruto ?? "-"}</p>
                <p>Atribuídos: {c.atribuidos ?? "-"}</p>
                <p>Restantes: {c.restantes ?? "-"}</p>
                <p>Consultores que receberam: {c.consultoresReceberam ?? 0}</p>
              </div>
              <div className="mt-3 flex justify-between">
                <button
                  onClick={() => router.push(`/admin/campanha/${c.id}`)}
                  className="text-xs text-slate-700 underline"
                >
                  Ver detalhes
                </button>
                <button
                  onClick={() => {
                    setDeleteError("");
                    setCampaignToDelete(c);
                  }}
                  className="text-xs text-red-600 underline"
                >
                  Excluir base
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Importações</h2>
        <p className="text-sm text-slate-600">Batches importados com opção de exclusão total.</p>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="py-2 pr-3">Arquivo</th>
                <th className="py-2 pr-3">Campanha</th>
                <th className="py-2 pr-3">Total lido</th>
                <th className="py-2 pr-3">Importados</th>
                <th className="py-2 pr-3">Duplicados</th>
                <th className="py-2 pr-3">Atribuídos</th>
                <th className="py-2 pr-3">Não atribuídos</th>
                <th className="py-2 pr-3">Criado em</th>
                <th className="py-2 pr-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((batch) => (
                <tr key={batch.id} className="border-b last:border-b-0">
                  <td className="py-2 pr-3">{batch.nomeArquivoOriginal}</td>
                  <td className="py-2 pr-3">{batch.campaignName}</td>
                  <td className="py-2 pr-3">{batch.totalLeads}</td>
                  <td className="py-2 pr-3">{batch.importedLeads ?? batch.totalLeads}</td>
                  <td className="py-2 pr-3">{batch.duplicatedLeads ?? 0}</td>
                  <td className="py-2 pr-3">{batch.attributedLeads ?? 0}</td>
                  <td className="py-2 pr-3">{batch.notAttributedLeads ?? 0}</td>
                  <td className="py-2 pr-3">
                    {batch.createdAt ? new Date(batch.createdAt).toLocaleString("pt-BR") : "-"}
                  </td>
                  <td className="py-2 pr-3">
                    <button
                      onClick={() => {
                        setDeleteError("");
                        setBatchToDelete(batch);
                      }}
                      className="text-xs text-red-600 underline"
                    >
                      Excluir base
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {campaignToDelete ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl space-y-3">
            <h3 className="text-lg font-semibold text-slate-900">Excluir base</h3>
            <p className="text-sm text-slate-600">
              Tem certeza que deseja excluir completamente esta base? Isso irá remover a campanha, todos os leads
              e todas as atividades relacionadas. Esta ação é irreversível.
            </p>
            <p className="text-sm font-semibold text-slate-800">{campaignToDelete.nome}</p>
            {deleteError ? <p className="text-sm text-red-600">{deleteError}</p> : null}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setCampaignToDelete(null)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                onClick={deleteCampaign}
                disabled={deleteLoading}
                className="rounded-lg bg-red-600 text-white px-4 py-2 text-sm font-semibold hover:bg-red-500 disabled:opacity-60"
              >
                {deleteLoading ? "Excluindo..." : "Excluir base"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {batchToDelete ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl space-y-3">
            <h3 className="text-lg font-semibold text-slate-900">Excluir lote importado</h3>
            <p className="text-sm text-slate-600">
              Isso removerá todos os leads e atividades vinculados a este arquivo/importação. A ação é irreversível.
            </p>
            <p className="text-sm font-semibold text-slate-800">
              {batchToDelete.nomeArquivoOriginal} — {batchToDelete.totalLeads} leads
            </p>
            {deleteError ? <p className="text-sm text-red-600">{deleteError}</p> : null}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setBatchToDelete(null)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                onClick={deleteBatch}
                disabled={deleteLoading}
                className="rounded-lg bg-red-600 text-white px-4 py-2 text-sm font-semibold hover:bg-red-500 disabled:opacity-60"
              >
                {deleteLoading ? "Excluindo..." : "Excluir base"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
