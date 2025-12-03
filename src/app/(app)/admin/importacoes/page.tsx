"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

type Batch = {
  id: string;
  nomeArquivoOriginal: string;
  campaignId: string;
  campaignName: string;
  totalLeads: number;
  createdAt: string;
};

export default function ImportacoesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [batchToDelete, setBatchToDelete] = useState<Batch | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (status === "authenticated" && session?.user.role === "CONSULTOR") {
      router.replace("/board");
    }
  }, [status, session, router]);

  async function load() {
    const res = await fetch("/api/admin/import-batches", { cache: "no-store" });
    if (res.ok) setBatches(await res.json());
  }
  useEffect(() => {
    load();
  }, []);

  async function deleteBatch() {
    if (!batchToDelete) return;
    const res = await fetch(`/api/admin/import-batches/${batchToDelete.id}`, { method: "DELETE" });
    if (res.ok) {
      setMessage("Base excluída.");
      setBatchToDelete(null);
      await load();
    } else {
      setMessage("Erro ao excluir.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Admin</p>
          <h1 className="text-2xl font-semibold text-slate-900">Importações</h1>
          <p className="text-sm text-slate-600">Lotes importados com exclusão completa.</p>
        </div>
        <button
          onClick={load}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-100"
        >
          Atualizar
        </button>
      </div>

      {message ? <div className="text-sm text-slate-700">{message}</div> : null}

      <div className="rounded-xl border bg-white p-4 shadow-sm overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b">
              <th className="py-2 pr-3">Arquivo</th>
              <th className="py-2 pr-3">Campanha</th>
              <th className="py-2 pr-3">Total</th>
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
                <td className="py-2 pr-3">{new Date(batch.createdAt).toLocaleString("pt-BR")}</td>
                <td className="py-2 pr-3">
                  <button
                    onClick={() => setBatchToDelete(batch)}
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
                className="rounded-lg bg-red-600 text-white px-4 py-2 text-sm font-semibold hover:bg-red-500"
              >
                Excluir base
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
