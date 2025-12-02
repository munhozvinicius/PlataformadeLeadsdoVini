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
};

type User = { id: string; name: string; email: string; role: string };

export default function ImportPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [newCampaignName, setNewCampaignName] = useState("");
  const [newCampaignDescription, setNewCampaignDescription] = useState("");
  const [assignedUser, setAssignedUser] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (status === "authenticated" && session?.user.role !== "MASTER") {
      router.replace("/board");
    }
  }, [status, session, router]);

  useEffect(() => {
    loadCampaigns();
    loadUsers();
  }, []);

  const consultants = useMemo(() => users.filter((u) => u.role === "CONSULTOR"), [users]);

  async function loadCampaigns() {
    const res = await fetch("/api/campanhas/summary", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      setCampaigns(data);
    }
  }

  async function loadUsers() {
    const res = await fetch("/api/admin/users", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      setUsers(data);
    }
  }

  async function createCampaign() {
    if (!newCampaignName) return;
    const res = await fetch("/api/campanhas/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: newCampaignName, descricao: newCampaignDescription }),
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
    setMessage(`Importação concluída: ${json.created} criados.`);
    await loadCampaigns();
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
                <p>Total bruto: {c.totalBruto ?? "-"}</p>
                <p>Atribuídos: {c.atribuidos ?? "-"}</p>
                <p>Restantes: {c.restantes ?? "-"}</p>
                <p>Consultores que receberam: {c.consultoresReceberam ?? 0}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
