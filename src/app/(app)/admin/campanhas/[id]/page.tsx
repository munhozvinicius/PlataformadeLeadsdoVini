"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

type Lead = {
  id: string;
  empresa?: string | null;
  cidade?: string | null;
  telefone?: string | null;
  cnpj?: string | null;
  status: string;
  consultor?: { id: string; name: string; email: string } | null;
};

type User = { id: string; name: string; email: string; role: string; escritorio: string };

export default function CampanhaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session, status } = useSession();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [novoConsultor, setNovoConsultor] = useState("");
  const [leadSelecionado, setLeadSelecionado] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (status === "authenticated" && session?.user.role === "CONSULTOR") {
      router.replace("/board");
    }
  }, [status, session, router]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const consultores = useMemo(() => users.filter((u) => u.role === "CONSULTOR"), [users]);

  async function load() {
    const [leadRes, userRes] = await Promise.all([
      fetch(`/api/campanhas/${id}/leads`, { cache: "no-store" }),
      fetch("/api/admin/users", { cache: "no-store" }),
    ]);
    if (leadRes.ok) setLeads(await leadRes.json());
    if (userRes.ok) setUsers(await userRes.json());
  }

  async function reatribuir() {
    if (!leadSelecionado || !novoConsultor) {
      setMessage("Selecione lead e consultor.");
      return;
    }
    const res = await fetch("/api/leads/reatribuir", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId: leadSelecionado, novoConsultorId: novoConsultor }),
    });
    if (!res.ok) {
      setMessage("Erro ao reatribuir.");
      return;
    }
    setMessage("Lead reatribuído.");
    setLeadSelecionado(null);
    setNovoConsultor("");
    await load();
  }

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

      <div className="rounded-xl border bg-white p-4 shadow-sm overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b">
              <th className="py-2 pr-3">Empresa</th>
              <th className="py-2 pr-3">CNPJ</th>
              <th className="py-2 pr-3">Telefone</th>
              <th className="py-2 pr-3">Cidade</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 pr-3">Consultor</th>
              <th className="py-2 pr-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id} className="border-b last:border-b-0">
                <td className="py-2 pr-3">{lead.empresa ?? "-"}</td>
                <td className="py-2 pr-3">{lead.cnpj ?? "-"}</td>
                <td className="py-2 pr-3">{lead.telefone ?? "-"}</td>
                <td className="py-2 pr-3">{lead.cidade ?? "-"}</td>
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
          {message ? <div className="text-sm text-slate-700">{message}</div> : null}
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
