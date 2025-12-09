"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

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
  estrategia?: string | null;
  consultor?: { id: string; name: string; email: string } | null;
  status: string;
};

type User = { id: string; name: string; email: string; role: string; escritorio: string };

type CampaignSummary = {
  id: string;
  nome: string;
  totalBruto?: number;
  attribuidos?: number;
  restantes?: number;
};

export default function CampanhaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session, status } = useSession();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [novoConsultor, setNovoConsultor] = useState("");
  const [leadSelecionado, setLeadSelecionado] = useState<string | null>(null);
  const [reatribuirMessage, setReatribuirMessage] = useState("");
  const [distribuirMessage, setDistribuirMessage] = useState("");
  const [distribuirConsultor, setDistribuirConsultor] = useState("");
  const [distribuirQuantidade, setDistribuirQuantidade] = useState(10);
  const [distribuirLoading, setDistribuirLoading] = useState(false);
  const [campaignSummary, setCampaignSummary] = useState<CampaignSummary | null>(null);

  const load = useCallback(async () => {
    const [leadRes, userRes, summaryRes] = await Promise.all([
      fetch(`/api/campanhas/${id}/leads`, { cache: "no-store" }),
      fetch("/api/admin/users", { cache: "no-store" }),
      fetch("/api/campanhas/summary", { cache: "no-store" }),
    ]);
    if (leadRes.ok) {
      setLeads(await leadRes.json());
    } else if (leadRes.status === 401) {
      router.replace("/login");
      return;
    }
    if (userRes.ok) {
      setUsers(await userRes.json());
    }
    if (summaryRes.ok) {
      const summaryData = await summaryRes.json();
      const current = summaryData.find((camp: CampaignSummary) => camp.id === id) ?? null;
      setCampaignSummary(current);
    } else {
      setCampaignSummary(null);
    }
  }, [id, router]);

  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated") {
      router.replace("/login");
      return;
    }
    if (status === "authenticated") {
      if (session?.user.role === "CONSULTOR") {
        router.replace("/board");
        return;
      }
      load();
    }
  }, [status, session, router, load]);

  const consultores = useMemo(() => users.filter((u) => u.role === "CONSULTOR"), [users]);

  async function reatribuir() {
    setReatribuirMessage("");
    if (!leadSelecionado || !novoConsultor) {
      setReatribuirMessage("Selecione lead e consultor.");
      return;
    }
    const res = await fetch("/api/leads/reatribuir", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId: leadSelecionado, novoConsultorId: novoConsultor }),
    });
    if (!res.ok) {
      setReatribuirMessage("Erro ao reatribuir.");
      return;
    }
    setReatribuirMessage("Lead reatribuído.");
    setLeadSelecionado(null);
    setNovoConsultor("");
    await load();
  }

  async function distribuirLotes() {
    setDistribuirMessage("");
    if (!distribuirConsultor || distribuirQuantidade <= 0) {
      setDistribuirMessage("Selecione consultor e quantidade maior que zero.");
      return;
    }
    setDistribuirLoading(true);
    const res = await fetch("/api/campanhas/distribuir", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campanhaId: id,
        consultorId: distribuirConsultor,
        quantidade: distribuirQuantidade,
      }),
    });
    setDistribuirLoading(false);
    if (!res.ok) {
      try {
        const err = await res.json();
        setDistribuirMessage(err.message || "Erro ao distribuir.");
      } catch {
        setDistribuirMessage("Erro ao distribuir.");
      }
      return;
    }
    const json = await res.json();
    const assignedCount = json.assigned ?? json["atribuídos"] ?? distribuirQuantidade;
    const target = consultores.find((c) => c.id === distribuirConsultor);
    setDistribuirMessage(
      `Distribuídos ${assignedCount} leads para ${target?.name ?? "consultor selecionado"}.`,
    );
    await load();
  }

  const displayName = (lead: Lead) => lead.razaoSocial ?? lead.nomeFantasia ?? "Sem empresa";
  const extraPhones = (lead: Lead) =>
    [lead.telefone2, lead.telefone3].filter((phone): phone is string => Boolean(phone));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Master/Owner</p>
          <h1 className="text-2xl font-semibold text-slate-900">Campanha</h1>
          <p className="text-sm text-slate-500">Lista completa de leads e reatribuição.</p>
        </div>
        <button
          onClick={load}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-100"
        >
          Atualizar
        </button>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Distribuição guiada</p>
            <h2 className="text-lg font-semibold text-slate-900">Atribuir leads em lotes</h2>
            <p className="text-sm text-slate-500">
              Escolha um consultor, defina quantas empresas serão enviadas por vez e acompanhe os
              leads restantes na campanha.
            </p>
          </div>
          {campaignSummary ? (
            <div className="text-xs text-slate-500">
              <p>Total bruto: {campaignSummary.totalBruto ?? 0}</p>
              <p>Restantes: {campaignSummary.restantes ?? 0}</p>
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="space-y-1 md:col-span-2">
            <label className="text-xs text-slate-600">Consultor</label>
            <select
              value={distribuirConsultor}
              onChange={(e) => setDistribuirConsultor(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Selecione</option>
              {consultores.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.email})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-slate-600">Quantidade por lote</label>
            <input
              type="number"
              min={1}
              value={distribuirQuantidade}
              onChange={(e) => setDistribuirQuantidade(Math.max(1, Number(e.target.value)))}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
            <div className="flex flex-wrap gap-2 text-[11px]">
              {[10, 25, 50].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setDistribuirQuantidade(value)}
                  className={`rounded-full border px-3 py-1 uppercase ${distribuirQuantidade === value
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-600"
                    }`}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2 md:col-span-1">
            <label className="text-xs text-slate-600">Ação</label>
            <button
              onClick={distribuirLotes}
              disabled={distribuirLoading}
              className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {distribuirLoading ? "Distribuindo..." : "Distribuir"}
            </button>
            {distribuirMessage ? (
              <p className="text-[13px] text-slate-600">{distribuirMessage}</p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b">
              <th className="py-2 pr-3">Empresa</th>
              <th className="py-2 pr-3">CNPJ</th>
              <th className="py-2 pr-3">Telefone</th>
              <th className="py-2 pr-3">Cidade / Endereço</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 pr-3">Consultor</th>
              <th className="py-2 pr-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id} className="border-b last:border-b-0">
                <td className="py-2 pr-3">
                  <p className="font-semibold">{displayName(lead)}</p>
                  <p className="text-[11px] text-slate-500">{lead.vertical ?? "Vertical não informada"}</p>
                </td>
                <td className="py-2 pr-3">{lead.cnpj ?? "-"}</td>
                <td className="py-2 pr-3">
                  <p className="text-xs text-slate-500">{lead.telefone ?? lead.telefone1 ?? "-"}</p>
                  {extraPhones(lead).map((phone) => (
                    <p key={phone} className="text-[11px] text-slate-400">
                      {phone}
                    </p>
                  ))}
                </td>
                <td className="py-2 pr-3">
                  <p className="text-xs text-slate-500">{lead.cidade ?? "-"}</p>
                  {lead.endereco ? (
                    <p className="text-[11px] text-slate-400">{lead.endereco}</p>
                  ) : null}
                </td>
                <td className="py-2 pr-3">{lead.status}</td>
                <td className="py-2 pr-3">
                  {lead.consultor ? `${lead.consultor.name} (${lead.consultor.email})` : "-"}
                </td>
                <td className="py-2 pr-3">
                  <button
                    onClick={() => setLeadSelecionado(lead.id)}
                    className="text-sm text-slate-700 underline"
                  >
                    Reatribuir
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {leadSelecionado ? (
        <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
          <h3 className="text-lg font-semibold text-slate-900">Reatribuir lead</h3>
          <div className="space-y-2">
            <label className="text-xs text-slate-600">Novo consultor</label>
            <select
              value={novoConsultor}
              onChange={(e) => setNovoConsultor(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Selecione</option>
              {consultores.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.email})
                </option>
              ))}
            </select>
          </div>
          {reatribuirMessage ? (
            <div className="text-sm text-slate-700">{reatribuirMessage}</div>
          ) : null}
          <button
            onClick={reatribuir}
            className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-semibold hover:bg-slate-800"
          >
            Confirmar
          </button>
        </div>
      ) : null}
    </div>
  );
}
