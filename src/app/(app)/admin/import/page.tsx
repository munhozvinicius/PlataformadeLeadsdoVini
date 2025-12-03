"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { zipSync } from "fflate";

type Campaign = {
  id: string;
  nome: string;
  descricao?: string | null;
  objetivo?: string | null;
  vertical?: string | null;
  regiaoUf?: string | null;
  regiaoCidade?: string | null;
  observacoes?: string | null;
  periodoInicio?: string | null;
  periodoFim?: string | null;
  createdAt?: string | null;
  totalLeads?: number;
  atribuidos?: number;
  restantes?: number;
  status?: string | null;
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

export default function CampaignManagementPage() {
  const router = useRouter();
  const { data: session, status } = useSession();

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [campaignForm, setCampaignForm] = useState({
    nome: "",
    descricao: "",
    objetivo: "",
    vertical: "",
    regiaoUf: "",
    regiaoCidade: "",
    observacoes: "",
    dataInicio: "",
    dataFim: "",
  });
  const [batchToDelete, setBatchToDelete] = useState<ImportBatch | null>(null);

  useEffect(() => {
    if (status === "authenticated" && session?.user.role !== "MASTER") {
      router.replace("/board");
    }
  }, [status, session, router]);

  useEffect(() => {
    loadCampaigns();
    loadBatches();
  }, []);

  async function loadCampaigns() {
    const res = await fetch("/api/campaigns", { cache: "no-store" });
    if (res.ok) {
      setCampaigns(await res.json());
    }
  }

  async function loadBatches() {
    const res = await fetch("/api/admin/import-batches", { cache: "no-store" });
    if (res.ok) setBatches(await res.json());
  }

  async function createCampaign() {
    if (!campaignForm.nome) {
      setMessage("Informe o nome da campanha.");
      return;
    }
    const res = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(campaignForm),
    });
    if (!res.ok) {
      setMessage("Erro ao criar campanha.");
      return;
    }
    setCampaignForm({
      nome: "",
      descricao: "",
      objetivo: "",
      vertical: "",
      regiaoUf: "",
      regiaoCidade: "",
      observacoes: "",
      dataInicio: "",
      dataFim: "",
    });
    await loadCampaigns();
  }

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    if (!file) {
      setMessage("Selecione o arquivo da planilha.");
      return;
    }
    if (!campaignId) {
      setMessage("Escolha uma campanha antes de importar.");
      return;
    }

    const buffer = await file.arrayBuffer();
    const zipped = zipSync({ [file.name]: new Uint8Array(buffer) });
    const zippedArray = new Uint8Array(zipped);

    const formData = new FormData();
    formData.append("file", new Blob([zippedArray], { type: "application/zip" }), `${file.name}.zip`);
    formData.append("compressed", "true");
    formData.append("campanhaId", campaignId);
    formData.append("assignmentType", "none");

    setLoading(true);
    const res = await fetch("/api/campanhas/import", {
      method: "POST",
      body: formData,
    });
    setLoading(false);
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      setMessage(err?.message ?? "Erro ao importar planilha.");
      return;
    }
    const json = await res.json();
    setMessage(
      `Importação concluída: ${json.importedLeads} criados, ${json.duplicatedLeads} duplicados, em estoque: ${json.notAttributedLeads}.`
    );
    await Promise.all([loadCampaigns(), loadBatches()]);
  }

  async function deleteBatch() {
    if (!batchToDelete) return;
    const res = await fetch(`/api/admin/import-batches/${batchToDelete.id}`, { method: "DELETE" });
    if (!res.ok) {
      setMessage("Não foi possível excluir este lote.");
    }
    setBatchToDelete(null);
    await Promise.all([loadCampaigns(), loadBatches()]);
  }

  async function updateCampaignStatus(id: string, statusValue: string) {
    await fetch(`/api/campaigns/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: statusValue }),
    });
    await loadCampaigns();
  }

  async function deleteCampaign(id: string) {
    await fetch(`/api/campaigns/${id}`, { method: "DELETE" });
    await Promise.all([loadCampaigns(), loadBatches()]);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white/70 backdrop-blur p-6 shadow-sm">
        <h1 className="text-3xl font-bold text-slate-900">Gerenciamento de Campanhas – Plataforma de Leads da Vivo SP3</h1>
        <p className="text-sm text-slate-600">
          Crie campanhas, suba bases, organize distribuições e acompanhe métricas em um único painel.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white/70 backdrop-blur p-6 shadow-sm space-y-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Bloco A</p>
          <h2 className="text-xl font-semibold text-slate-900">Criar nova campanha</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            { key: "nome", label: "Nome da campanha", required: true },
            { key: "descricao", label: "Descrição" },
            { key: "objetivo", label: "Objetivo" },
            { key: "vertical", label: "Vertical" },
            { key: "regiaoUf", label: "Região (UF)" },
            { key: "regiaoCidade", label: "Cidade" },
            { key: "observacoes", label: "Observações" },
          ].map((field) => (
            <div key={field.key} className="space-y-1">
              <label className="text-xs text-slate-600">{field.label}</label>
              <input
                value={campaignForm[field.key as keyof typeof campaignForm]}
                onChange={(e) => setCampaignForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                required={field.required}
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
            </div>
          ))}
          <div className="space-y-1">
            <label className="text-xs text-slate-600">Data de início</label>
            <input
              type="date"
              value={campaignForm.dataInicio}
              onChange={(e) => setCampaignForm((prev) => ({ ...prev, dataInicio: e.target.value }))}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-slate-600">Data de fim (opcional)</label>
            <input
              type="date"
              value={campaignForm.dataFim}
              onChange={(e) => setCampaignForm((prev) => ({ ...prev, dataFim: e.target.value }))}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
          </div>
        </div>
        <button
          onClick={createCampaign}
          className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-semibold hover:bg-slate-800"
        >
          Criar campanha
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white/70 backdrop-blur p-6 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Bloco B</p>
            <h2 className="text-xl font-semibold text-slate-900">Importar Base de Leads</h2>
            <p className="text-sm text-slate-600">O arquivo é compactado em ZIP automaticamente para evitar limitações.</p>
          </div>
          <a href="/api/import/template" className="text-sm text-blue-700 underline">
            Baixar modelo de planilha (Excel)
          </a>
        </div>
        <form className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end" onSubmit={handleImport}>
          <div className="space-y-1 md:col-span-1">
            <label className="text-xs text-slate-600">Campanha</label>
            <select
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            >
              <option value="">Selecione</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1 md:col-span-1">
            <label className="text-xs text-slate-600">Arquivo Excel</label>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm"
            />
          </div>
          <div className="md:col-span-1 flex gap-2">
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-semibold hover:bg-slate-800 disabled:opacity-50 w-full"
            >
              {loading ? "Importando..." : "Importar base"}
            </button>
          </div>
        </form>
        {message ? <div className="text-sm text-slate-700">{message}</div> : null}

        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold text-slate-900">Importações</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b">
                  <th className="py-2 pr-3">Arquivo</th>
                  <th className="py-2 pr-3">Campanha</th>
                  <th className="py-2 pr-3">Total lido</th>
                  <th className="py-2 pr-3">Importados</th>
                  <th className="py-2 pr-3">Duplicados</th>
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
                    <td className="py-2 pr-3">{batch.notAttributedLeads ?? 0}</td>
                    <td className="py-2 pr-3">
                      {batch.createdAt ? new Date(batch.createdAt).toLocaleString("pt-BR") : "-"}
                    </td>
                    <td className="py-2 pr-3">
                      <button onClick={() => setBatchToDelete(batch)} className="text-xs text-red-600 underline">
                        Excluir batch
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white/70 backdrop-blur p-6 shadow-sm space-y-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Bloco C</p>
          <h2 className="text-xl font-semibold text-slate-900">Campanhas criadas</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {campaigns.map((c) => (
            <div key={c.id} className="rounded-xl border bg-white/70 p-4 shadow-sm space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-sm text-slate-900">{c.nome}</p>
                  <p className="text-xs text-slate-500">{c.descricao ?? "-"}</p>
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">
                  {c.status ?? "Ativa"}
                </span>
              </div>
              <div className="text-xs text-slate-600 space-y-1">
                <p>Data de criação: {c.createdAt ? new Date(c.createdAt).toLocaleDateString("pt-BR") : "-"}</p>
                <p>Total bruto: {c.totalLeads ?? 0}</p>
                <p>Atribuídos: {c.atribuidos ?? 0}</p>
                <p>Restantes: {c.restantes ?? 0}</p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <button
                  onClick={() => router.push(`/admin/campaign/${c.id}`)}
                  className="rounded-lg border border-slate-200 px-3 py-1 hover:bg-slate-50"
                >
                  Ver detalhes
                </button>
                <button
                  onClick={() => updateCampaignStatus(c.id, "PAUSADA")}
                  className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1 text-amber-700"
                >
                  Pausar
                </button>
                <button
                  onClick={() => updateCampaignStatus(c.id, "ENCERRADA")}
                  className="rounded-lg border border-slate-200 px-3 py-1 text-slate-700"
                >
                  Encerrar
                </button>
                <button
                  onClick={() => deleteCampaign(c.id)}
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-1 text-red-700"
                >
                  Excluir
                </button>
              </div>
            </div>
          ))}
        </div>
        {campaigns.length === 0 ? <p className="text-sm text-slate-500">Nenhuma campanha cadastrada.</p> : null}
      </div>

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
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setBatchToDelete(null)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                onClick={deleteBatch}
                disabled={loading}
                className="rounded-lg bg-red-600 text-white px-4 py-2 text-sm font-semibold hover:bg-red-500 disabled:opacity-60"
              >
                Excluir batch
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
