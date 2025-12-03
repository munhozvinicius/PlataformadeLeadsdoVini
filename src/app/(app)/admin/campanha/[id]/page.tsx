"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Role } from "@prisma/client";

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
type DistributionRow = {
  officeName: string;
  consultantId: string;
  consultantName: string;
  totalAtribuidos: number;
  trabalhados: number;
  restantes: number;
  fechados: number;
  perdidos: number;
};
type Resumo = { total: number; estoque: number; atribuidos: number; fechados: number; perdidos: number };
type AdminUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  role: string;
  escritorio?: string | null;
  office?: { id?: string | null; name?: string | null } | null;
  owner?: { escritorio?: string | null } | null;
};

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
  const [distribution, setDistribution] = useState<DistributionRow[]>([]);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [offices, setOffices] = useState<{ id: string; name: string; code?: string | null }[]>([]);
  const [consultants, setConsultants] = useState<
    {
      id: string;
      name?: string | null;
      email?: string | null;
      officeId?: string | null;
      officeName?: string | null;
      officeCode?: string | null;
    }[]
  >([]);
  const [selectedOffice, setSelectedOffice] = useState<string>("all");
  const [selectedConsultants, setSelectedConsultants] = useState<string[]>([]);
  const [quantityPerConsultant, setQuantityPerConsultant] = useState<number>(5);
  const isMaster = session?.user.role === Role.MASTER;
  const canDistribute = isMaster;

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

  const loadDistribution = useCallback(async () => {
    const res = await fetch(`/api/campaigns/${id}/distribution`, { cache: "no-store" });
    if (res.ok) {
      const json = await res.json();
      setResumo(json.resumo);
      setDistribution(json.distribution ?? []);
    }
  }, [id]);

  const loadOfficesAndConsultants = useCallback(async () => {
    const [officeRes, userRes] = await Promise.all([
      fetch("/api/admin/offices", { cache: "no-store" }),
      fetch("/api/admin/users", { cache: "no-store" }),
    ]);
    if (officeRes.ok) {
      setOffices(await officeRes.json());
    }
    if (userRes.ok) {
      const users: AdminUser[] = await userRes.json();
      const onlyConsultants = users.filter((u) => u.role === "CONSULTOR");
      setConsultants(
        onlyConsultants.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          officeId: u.office?.id ?? null,
          officeName: u.office?.name ?? u.escritorio ?? u.owner?.escritorio ?? "",
          officeCode: (u as { office?: { code?: string } }).office?.code ?? u.escritorio ?? u.owner?.escritorio ?? null,
        }))
      );
    }
  }, []);

  useEffect(() => {
    load();
    loadDistribution();
    loadOfficesAndConsultants();
  }, [load, loadDistribution, loadOfficesAndConsultants]);

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

  const resumoCards: Resumo | null =
    resumo ??
    (data.resumo
      ? {
          total: (data.resumo.totalLeads as number | undefined) ?? 0,
          estoque: data.resumo.estoque ?? 0,
          atribuidos: data.resumo.atribuidos ?? 0,
          fechados: data.resumo.fechados ?? 0,
          perdidos: data.resumo.perdidos ?? 0,
        }
      : null);
  const batches: Batch[] = data.batches ?? [];
  const distr = data.distribuicao ?? [];
  const selectedOfficeCode =
    selectedOffice === "all" ? null : offices.find((o) => o.id === selectedOffice)?.code ?? null;
  const filteredConsultants = consultants.filter((c) =>
    selectedOffice === "all"
      ? true
      : c.officeId === selectedOffice || (!!selectedOfficeCode && c.officeCode === selectedOfficeCode)
  );
  const tableRows = distribution
    .filter((row) =>
      selectedOffice === "all"
        ? true
        : filteredConsultants.some((c) => c.id === row.consultantId)
    )
    .sort((a, b) => b.totalAtribuidos - a.totalAtribuidos);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Campanha</p>
        <h1 className="text-2xl font-semibold text-slate-900">{data.campaign?.nome}</h1>
        <p className="text-sm text-slate-600">{data.campaign?.descricao}</p>
        {message ? <p className="text-sm text-slate-700">{message}</p> : null}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <ResumoCard title="Total" value={resumoCards?.total ?? 0} />
        <ResumoCard title="Estoque" value={resumoCards?.estoque ?? 0} />
        <ResumoCard title="Atribuídos" value={resumoCards?.atribuidos ?? 0} />
        <ResumoCard title="Fechados" value={resumoCards?.fechados ?? 0} />
        <ResumoCard title="Perdidos" value={resumoCards?.perdidos ?? 0} />
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Distribuição por consultor</h2>
            <p className="text-sm text-slate-600">Controle de estoque da campanha e racionamento por consultor.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={selectedOffice}
              onChange={(e) => setSelectedOffice(e.target.value)}
              className="rounded-lg border px-3 py-2 text-sm"
            >
              <option value="all">Todos os escritórios</option>
              {offices.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div className="space-y-1">
            <label className="text-xs text-slate-600">Consultores</label>
            <select
              multiple
              disabled={!canDistribute}
              value={selectedConsultants}
              onChange={(e) =>
                setSelectedConsultants(Array.from(e.target.selectedOptions).map((opt) => opt.value))
              }
              className="w-full rounded-lg border px-3 py-2 text-sm h-32"
            >
              {filteredConsultants.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name ?? c.email} {c.officeName ? `(${c.officeName})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-slate-600">Quantidade por consultor</label>
            <input
              type="number"
              min={1}
              value={quantityPerConsultant}
              onChange={(e) => setQuantityPerConsultant(Math.max(1, Number(e.target.value)))}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              disabled={!canDistribute}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-slate-600">Ação</label>
            <button
              disabled={!canDistribute}
              onClick={async () => {
                setMessage("");
                if (selectedConsultants.length === 0) {
                  setMessage("Selecione consultores para distribuir.");
                  return;
                }
                const res = await fetch(`/api/campaigns/${id}/distribution`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    officeId: selectedOffice === "all" ? null : selectedOffice,
                    consultantIds: selectedConsultants,
                    quantityPerConsultant,
                  }),
                });
                if (!res.ok) {
                  setMessage("Erro ao distribuir.");
                } else {
                  setMessage("Leads distribuídos com sucesso.");
                  await load();
                  await loadDistribution();
                }
              }}
              className="w-full rounded-lg bg-slate-900 text-white px-3 py-2 text-sm font-semibold hover:bg-slate-800 disabled:opacity-60"
            >
              Distribuir leads
            </button>
            {!canDistribute ? (
              <p className="text-xs text-slate-500">
                Apenas usuários MASTER podem distribuir leads. Owners visualizam os números do escritório.
              </p>
            ) : null}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="py-2 pr-3">Escritório</th>
                <th className="py-2 pr-3">Consultor</th>
                <th className="py-2 pr-3">Atribuídos</th>
                <th className="py-2 pr-3">Trabalhados</th>
                <th className="py-2 pr-3">Restantes</th>
                <th className="py-2 pr-3">Fechados</th>
                <th className="py-2 pr-3">Perdidos</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row) => (
                <tr
                  key={row.consultantId}
                  className="border-b last:border-b-0 hover:bg-slate-50 cursor-pointer"
                  onClick={() => router.push(`/board?consultantId=${row.consultantId}&campaignId=${id}`)}
                >
                  <td className="py-2 pr-3">{row.officeName || "-"}</td>
                  <td className="py-2 pr-3">{row.consultantName}</td>
                  <td className="py-2 pr-3">{row.totalAtribuidos}</td>
                  <td className="py-2 pr-3">{row.trabalhados}</td>
                  <td className="py-2 pr-3">{row.restantes}</td>
                  <td className="py-2 pr-3">{row.fechados}</td>
                  <td className="py-2 pr-3">{row.perdidos}</td>
                </tr>
              ))}
              {tableRows.length === 0 ? (
                <tr>
                  <td className="py-2 text-sm text-slate-500" colSpan={7}>
                    Sem dados.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
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
