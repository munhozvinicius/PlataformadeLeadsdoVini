"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

type Batch = {
  id: string;
  nomeArquivoOriginal: string;
  fileName?: string | null;
  totalLeads: number;
  importedLeads: number;
  duplicatedLeads: number;
  attributedLeads: number;
  notAttributedLeads: number;
  createdAt: string;
};

type Distribuicao = { consultorId: string | null; status: string; _count: { status: number } };

export default function CampanhaDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session, status } = useSession();
  const [data, setData] = useState<{
    campaign?: { id: string; nome?: string | null; descricao?: string | null };
    resumo?: { totalLeads?: number; estoque?: number; atribuidos?: number; fechados?: number; perdidos?: number };
    batches?: Batch[];
    distribuicao?: Distribuicao[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (status === "authenticated" && session?.user.role === "CONSULTOR") {
      router.replace("/board");
    }
  }, [status, session, router]);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/campaigns/overview?campaignId=${id}`, { cache: "no-store" });
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function deleteBatch(batchId: string) {
    const res = await fetch(`/api/admin/import-batches/${batchId}`, { method: "DELETE" });
    if (!res.ok) {
      setMessage("Não foi possível excluir lote (verifique leads fechados).");
    } else {
      setMessage("Lote excluído.");
      await load();
    }
  }

  if (!data) {
    return <div className="text-sm text-slate-600">{loading ? "Carregando..." : "Campanha não encontrada"}</div>;
  }

  const resumo = data.resumo;
  const batches: Batch[] = data.batches ?? [];
  const distr: Distribuicao[] = data.distribuicao ?? [];

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Campanha</p>
        <h1 className="text-2xl font-semibold text-slate-900">{data.campaign?.nome}</h1>
        <p className="text-sm text-slate-600">{data.campaign?.descricao}</p>
        {message ? <p className="text-sm text-slate-700">{message}</p> : null}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <ResumoCard title="Total" value={resumo?.totalLeads ?? 0} />
        <ResumoCard title="Estoque" value={resumo?.estoque ?? 0} />
        <ResumoCard title="Atribuídos" value={resumo?.atribuidos ?? 0} />
        <ResumoCard title="Fechados" value={resumo?.fechados ?? 0} />
        <ResumoCard title="Perdidos" value={resumo?.perdidos ?? 0} />
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900 mb-2">Lotes importados</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="py-2 pr-3">Arquivo</th>
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
                  <td className="py-2 pr-3">{batch.nomeArquivoOriginal || batch.fileName}</td>
                  <td className="py-2 pr-3">{batch.totalLeads}</td>
                  <td className="py-2 pr-3">{batch.importedLeads}</td>
                  <td className="py-2 pr-3">{batch.duplicatedLeads}</td>
                  <td className="py-2 pr-3">{batch.attributedLeads}</td>
                  <td className="py-2 pr-3">{batch.notAttributedLeads}</td>
                  <td className="py-2 pr-3">{new Date(batch.createdAt).toLocaleString("pt-BR")}</td>
                  <td className="py-2 pr-3">
                    <button
                      onClick={() => deleteBatch(batch.id)}
                      className="text-xs text-red-600 underline"
                    >
                      Excluir lote
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900 mb-2">Distribuição por consultor</h2>
        <div className="space-y-1 text-sm text-slate-700">
          {distr.length === 0 ? <p className="text-slate-500 text-sm">Sem dados</p> : null}
          {distr.map((d, idx) => (
            <div key={`${d.consultorId}-${d.status}-${idx}`} className="flex justify-between">
              <span>{d.consultorId ?? "Sem consultor"} — {d.status}</span>
              <span className="text-slate-500">{d._count.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ResumoCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded-xl border bg-white p-3 shadow-sm">
      <p className="text-xs uppercase text-slate-500">{title}</p>
      <p className="text-xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}
