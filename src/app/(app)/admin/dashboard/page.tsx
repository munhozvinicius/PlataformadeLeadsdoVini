"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { STAGES } from "@/constants/stages";

type DashboardData = {
  totalLeads: number;
  workedLeads: number;
  byStage: { stage: string; count: number }[];
  outcomes: { outcomeLabel: string; count: number }[];
};

export default function AdminDashboardPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "authenticated" && session?.user.role !== "MASTER") {
      router.replace("/board");
    }
  }, [status, session, router]);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    const res = await fetch("/api/admin/dashboard", { cache: "no-store" });
    if (res.ok) {
      const payload = await res.json();
      setData(payload);
    }
    setLoading(false);
  }

  const workedPercent =
    data && data.totalLeads > 0 ? Math.round((data.workedLeads / data.totalLeads) * 100) : 0;

  function stageLabel(stage: string) {
    return STAGES.find((s) => s.id === stage)?.title ?? stage;
  }

  function handleExport() {
    window.location.href = "/api/admin/export";
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Master</p>
          <h1 className="text-2xl font-semibold text-slate-900">Dashboard da Campanha</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchData}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-100"
          >
            Atualizar
          </button>
          <button
            onClick={handleExport}
            className="rounded-lg bg-slate-900 text-white px-3 py-2 text-sm font-semibold hover:bg-slate-800"
          >
            Exportar CSV
          </button>
        </div>
      </div>

      {loading ? <div>Carregando...</div> : null}
      {data ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">Total de leads</p>
              <p className="text-2xl font-semibold">{data.totalLeads}</p>
            </div>
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">Leads trabalhados</p>
              <p className="text-2xl font-semibold">
                {data.workedLeads}{" "}
                <span className="text-sm text-slate-500">({workedPercent}% do total)</span>
              </p>
            </div>
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">Palitagens mais comuns</p>
              <div className="space-y-1 text-sm text-slate-700 mt-2">
                {data.outcomes.length === 0 ? (
                  <p className="text-xs text-slate-500">Nenhum dado ainda.</p>
                ) : null}
                {data.outcomes.map((o) => (
                  <div key={o.outcomeLabel} className="flex justify-between">
                    <span>{o.outcomeLabel ?? "Sem rótulo"}</span>
                    <span className="text-slate-500">{o.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <p className="text-sm font-semibold text-slate-900 mb-3">Leads por estágio</p>
            <div className="space-y-2 text-sm text-slate-700">
              {data.byStage.length === 0 ? (
                <p className="text-xs text-slate-500">Nenhum lead encontrado.</p>
              ) : null}
              {data.byStage.map((item) => (
                <div key={item.stage} className="flex items-center justify-between">
                  <span>{stageLabel(item.stage)}</span>
                  <span className="font-semibold">{item.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
