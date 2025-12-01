"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

type CampaignSummary = {
  id: string;
  nome: string;
  totalBruto: number;
  atribuidos: number;
  restantes: number;
};

type User = { id: string; name: string; email: string; role: string; escritorio: string };

export default function DistribuicaoPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [consultorId, setConsultorId] = useState("");
  const [quantidade, setQuantidade] = useState(10);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (status === "authenticated" && session?.user.role === "CONSULTOR") {
      router.replace("/board");
    }
  }, [status, session, router]);

  useEffect(() => {
    loadData();
  }, []);

  const consultores = useMemo(() => users.filter((u) => u.role === "CONSULTOR"), [users]);

  async function loadData() {
    const [campRes, userRes] = await Promise.all([
      fetch("/api/campanhas/summary", { cache: "no-store" }),
      fetch("/api/admin/users", { cache: "no-store" }),
    ]);
    if (campRes.ok) {
      setCampaigns(await campRes.json());
    }
    if (userRes.ok) {
      setUsers(await userRes.json());
    }
  }

  async function distribuir() {
    setMessage("");
    if (!campaignId || !consultorId || quantidade <= 0) {
      setMessage("Selecione campanha, consultor e quantidade > 0.");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/campanhas/distribuir", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campanhaId, consultorId, quantidade }),
    });
    setLoading(false);
    if (!res.ok) {
      setMessage("Erro ao distribuir.");
      return;
    }
    const json = await res.json();
    setMessage(`Atribuídos ${json["atribuídos"] ?? quantidade} leads.`);
    await loadData();
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Master/Owner</p>
        <h1 className="text-2xl font-semibold text-slate-900">Distribuição parcial</h1>
        <p className="text-sm text-slate-500">
          Selecione campanha, consultor e quantidade para distribuir leads restantes.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="rounded-xl border bg-white p-4 shadow-sm lg:col-span-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
              <label className="text-xs text-slate-600">Consultor</label>
              <select
                value={consultorId}
                onChange={(e) => setConsultorId(e.target.value)}
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
              <label className="text-xs text-slate-600">Quantidade de leads</label>
              <input
                type="number"
                min={1}
                value={quantidade}
                onChange={(e) => setQuantidade(Number(e.target.value))}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="mt-4">
            {message ? <div className="text-sm text-slate-700 mb-2">{message}</div> : null}
            <button
              onClick={distribuir}
              disabled={loading}
              className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-semibold hover:bg-slate-800 disabled:opacity-50"
            >
              {loading ? "Distribuindo..." : "Atribuir"}
            </button>
          </div>
        </div>

        <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">Resumo por campanha</h2>
          <div className="space-y-2 text-sm text-slate-700 max-h-96 overflow-y-auto">
            {campaigns.map((c) => (
              <div key={c.id} className="border rounded-lg p-3 bg-slate-50">
                <p className="font-semibold">{c.nome}</p>
                <p className="text-xs text-slate-500">ID: {c.id}</p>
                <p className="text-xs text-slate-600 mt-1">Total bruto: {c.totalBruto ?? 0}</p>
                <p className="text-xs text-slate-600">Atribuídos: {c.atribuidos ?? 0}</p>
                <p className="text-xs text-slate-600">Restantes: {c.restantes ?? 0}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
