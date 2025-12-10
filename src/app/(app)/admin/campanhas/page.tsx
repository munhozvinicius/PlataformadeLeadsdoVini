"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

type CampaignSummary = {
  id: string;
  nome: string;
  descricao?: string;
  totalBruto?: number;
  atribuidos?: number;
  restantes?: number;
};

export default function CampanhasPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);

  const load = useCallback(async () => {
    const res = await fetch("/api/campanhas/summary", { cache: "no-store" });
    if (res.ok) {
      setCampaigns(await res.json());
    } else {
      console.error("Failed to load campaigns summary", res.status);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated" && session?.user.role === "CONSULTOR") {
      router.replace("/board");
    }
  }, [status, session, router]);

  useEffect(() => {
    if (status === "authenticated") {
      load();
    }
  }, [status, load]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Master/Owner</p>
          <h1 className="text-2xl font-semibold text-slate-900">Campanhas</h1>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/campanhas/nova-mapa-parque"
            className="rounded-lg border border-neon-pink bg-neon-pink/10 text-neon-pink px-3 py-2 text-sm font-bold hover:bg-neon-pink hover:text-white transition-all uppercase tracking-wide"
          >
            + Mapa Parque
          </Link>
          <button
            onClick={load}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-100"
          >
            Atualizar
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {campaigns.map((c) => (
          <div key={c.id} className="border rounded-lg p-4 bg-white shadow-sm">
            <p className="font-semibold text-sm">{c.nome}</p>
            <p className="text-xs text-slate-500">{c.descricao}</p>
            <div className="text-xs text-slate-600 mt-2 space-y-1">
              <p>Total bruto: {c.totalBruto ?? 0}</p>
              <p>Atribuídos: {c.atribuidos ?? 0}</p>
              <p>Restantes: {c.restantes ?? 0}</p>
            </div>
            <Link
              href={`/admin/campanhas/${c.id}`}
              className="inline-block mt-3 text-sm text-slate-700 underline"
            >
              Abrir
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
