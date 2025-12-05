"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Office } from "@prisma/client";

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
  office?: string | null;
};

export default function CampaignManagementPage() {
  const router = useRouter();
  const { data: session, status } = useSession();

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [, setMessage] = useState("");
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
    office: "",
  });

  useEffect(() => {
    if (status === "authenticated" && session?.user.role !== "MASTER") {
      router.replace("/board");
    }
  }, [status, session, router]);

  useEffect(() => {
    loadCampaigns();
  }, []);

  async function loadCampaigns() {
    const res = await fetch("/api/campaigns", { cache: "no-store" });
    if (res.ok) {
      setCampaigns(await res.json());
    }
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
      office: "",
    });
    await loadCampaigns();
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
    const res = await fetch(`/api/campaigns/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setMessage(data?.error ?? "Erro ao excluir campanha.");
      return;
    }
    setCampaigns((prev) => prev.filter((c) => c.id !== id));
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
            <label className="text-xs text-slate-600">Escritório / Parceiro</label>
            <select
              value={campaignForm.office}
              onChange={(e) => setCampaignForm((prev) => ({ ...prev, office: e.target.value }))}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            >
              <option value="">Selecione</option>
              <option value={Office.SAFE_TI}>SAFE_TI</option>
              <option value={Office.JLC_TECH}>JLC_TECH</option>
            </select>
          </div>
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

      {/* Bloco B removido daqui: importação passa a ser feita no detalhe da campanha */}

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

      {/* Modal de exclusão de batch removido: exclusão agora é feita no detalhe da campanha */}
    </div>
  );
}
