"use client";

import { useEffect, useMemo, useState } from "react";

type Cliente = {
  key: string;
  documento: string | null;
  nome: string;
  vertical: string | null;
  campanhas: { id: string; nome: string }[];
  consultores: { id: string; name?: string | null; email?: string | null }[];
  leads: Array<{ id: string; campanha?: { id: string; nome: string } | null; status: string; updatedAt: string | null }>;
  likes: number;
  dislikes: number;
  lastUpdate: string | null;
};

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Cliente | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/admin/clientes", { cache: "no-store" });
        if (!res.ok) {
          setError("Erro ao carregar clientes.");
          return;
        }
        const data = await res.json();
        setClientes(data);
      } catch (err) {
        console.error(err);
        setError("Erro ao carregar clientes.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return clientes;
    const term = search.toLowerCase();
    return clientes.filter((c) =>
      (c.nome || "").toLowerCase().includes(term) ||
      (c.documento || "").toLowerCase().includes(term) ||
      c.campanhas.some((camp) => camp.nome.toLowerCase().includes(term))
    );
  }, [search, clientes]);

  return (
    <div className="max-w-7xl mx-auto w-full p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black uppercase text-white tracking-tight">Gestão de Clientes</h1>
          <p className="text-slate-400 text-sm">Visão consolidada de todas as bases (Portalinfo + Mapa Parque).</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, documento ou campanha..."
            className="bg-black border border-slate-700 text-white text-sm px-3 py-2 rounded w-80"
          />
          {loading && <span className="text-xs text-slate-400">Carregando...</span>}
        </div>
      </div>

      {error ? <div className="p-3 bg-red-900/30 border border-red-500 text-red-100 text-sm">{error}</div> : null}

      <div className="bg-pic-card border border-pic-zinc shadow-lg">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-black/60 uppercase text-[10px] text-slate-400 tracking-widest">
              <tr>
                <th className="text-left px-4 py-3">Cliente</th>
                <th className="text-left px-4 py-3">Documento</th>
                <th className="text-left px-4 py-3">Vertical</th>
                <th className="text-left px-4 py-3">Campanhas</th>
                <th className="text-left px-4 py-3">Likes/Dislikes</th>
                <th className="text-left px-4 py-3">Última Atualização</th>
                <th className="text-left px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.key} className="border-t border-slate-800 hover:bg-slate-900/50">
                  <td className="px-4 py-3 text-white font-bold">{c.nome}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-300">{c.documento ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-300">{c.vertical ?? "-"}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      {c.campanhas.map((camp) => (
                        <span key={camp.id} className="bg-slate-800 text-slate-200 text-[10px] px-2 py-1 rounded border border-slate-700">
                          {camp.nome}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-300">
                    <span className="text-neon-green font-bold mr-2">🔥 {c.likes}</span>
                    <span className="text-red-400 font-bold">⚠ {c.dislikes}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {c.lastUpdate ? new Date(c.lastUpdate).toLocaleDateString("pt-BR") : "-"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setSelected(c)}
                      className="text-xs uppercase font-bold px-3 py-1 border border-neon-green text-neon-green hover:bg-neon-green hover:text-black"
                    >
                      Detalhar
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-slate-500">Nenhum cliente encontrado.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selected ? (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6">
          <div className="bg-pic-card border-2 border-neon-green w-full max-w-4xl max-h-[80vh] overflow-auto p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] uppercase text-slate-500 tracking-widest">Cliente</p>
                <h3 className="text-2xl font-black text-white">{selected.nome}</h3>
                <p className="text-sm text-slate-400 font-mono">Doc: {selected.documento ?? "—"} • Vertical: {selected.vertical ?? "—"}</p>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="border border-white text-white px-3 py-1 text-sm uppercase font-bold hover:bg-white hover:text-black"
              >
                Fechar
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border border-slate-800 p-4">
                <h4 className="text-xs uppercase text-slate-400 tracking-widest mb-2">Campanhas</h4>
                <div className="space-y-2">
                  {selected.leads.map((l) => (
                    <div key={l.id} className="bg-black/40 border border-slate-800 p-3">
                      <p className="text-sm text-white font-bold">{l.campanha?.nome ?? "Sem campanha"}</p>
                      <p className="text-[10px] uppercase text-slate-500">Status: {l.status}</p>
                      <p className="text-[10px] text-slate-500">Atualizado: {l.updatedAt ? new Date(l.updatedAt).toLocaleString("pt-BR") : "-"}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="border border-slate-800 p-4">
                <h4 className="text-xs uppercase text-slate-400 tracking-widest mb-2">Responsáveis</h4>
                <div className="space-y-2">
                  {selected.consultores.map((c) => (
                    <div key={c.id} className="bg-black/40 border border-slate-800 p-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm text-white font-bold">{c.name ?? "Consultor"}</p>
                        <p className="text-[10px] text-slate-500">{c.email ?? "-"}</p>
                      </div>
                      <span className="text-[10px] text-neon-green uppercase font-black">Ativo</span>
                    </div>
                  ))}
                  {selected.consultores.length === 0 && <p className="text-xs text-slate-500">Nenhum consultor vinculado.</p>}
                </div>
              </div>
            </div>

            <div className="border border-slate-800 p-4">
              <h4 className="text-xs uppercase text-slate-400 tracking-widest mb-2">Feedbacks</h4>
              <p className="text-sm text-white">🔥 Likes: {selected.likes} • ⚠ Dislikes: {selected.dislikes}</p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
