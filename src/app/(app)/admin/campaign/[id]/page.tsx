"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { LeadStatus } from "@prisma/client";

type CampaignDetail = {
  campaign: { id: string; nome: string; descricao?: string | null; status?: string | null };
  resumo: { total: number; atribuidos: number; estoque: number; ganhos: number; perdidos: number };
  topMotivosPerda: { label: string | null; count: number }[];
};

type DistributionRow = {
  officeName: string;
  consultantId: string;
  consultantName: string;
  totalAtribuidos: number;
  trabalhados: number;
  restantes: number;
  fechados: number;
  perdidos: number;
  percentConcluido: number;
  tempoMedioTratativaMs: number;
  ultimaAtividadeAt?: string | null;
};

type LeadFilters = {
  status: LeadStatus | "";
  consultorId: string;
  cidade: string;
  uf: string;
  estrategia: string;
  vertical: string;
  documento: string;
  empresa: string;
  faturamentoMin: string;
  faturamentoMax: string;
  telefone: "all" | "with" | "without";
};

type CampaignBatch = {
  id: string;
  campaignId: string;
  nomeArquivoOriginal: string;
  totalLeads: number;
  importedLeads: number;
  createdAt: string;
};

type LeadItem = {
  id: string;
  documento?: string | null;
  razaoSocial?: string | null;
  nomeFantasia?: string | null;
  cidade?: string | null;
  estado?: string | null;
  cnpj?: string | null;
  vlFatPresumido?: string | null;
  telefone1?: string | null;
  telefone2?: string | null;
  telefone3?: string | null;
  logradouro?: string | null;
  territorio?: string | null;
  ofertaMkt?: string | null;
  cep?: string | null;
  numero?: string | null;
  estrategia?: string | null;
  vertical?: string | null;
  status: LeadStatus;
  consultor?: { id: string; name?: string | null; email?: string | null };
  officeId?: string | null;
};

type ConsultantWithOffice = {
  id: string;
  name?: string | null;
  email?: string | null;
  officeId?: string | null;
  officeName?: string | null;
  officeCode?: string | null;
};

const serverFilterKeys: Array<keyof LeadFilters> = [
  "status",
  "consultorId",
  "cidade",
  "uf",
  "estrategia",
  "vertical",
];

export default function CampaignDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { data: session, status } = useSession();
  const [, setLogs] = useState<{
    activities: { id: string; action: string; user: string; lead: string; timestamp: string }[];
    distributions: { id: string; admin: string; consultant: string; leadsSent: number; rulesApplied: string; timestamp: string }[];
  } | null>(null);
  const [audit, setAudit] = useState<{ total: number; invalidPhones: number; duplicated: number; invalids: number } | null>(
    null
  );
  const [detail, setDetail] = useState<CampaignDetail | null>(null);
  const [distribution, setDistribution] = useState<DistributionRow[]>([]);
  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [filters, setFilters] = useState<LeadFilters>({
    status: "",
    consultorId: "",
    cidade: "",
    uf: "",
    estrategia: "",
    vertical: "",
    documento: "",
    empresa: "",
    faturamentoMin: "",
    faturamentoMax: "",
    telefone: "all",
  });
  const [consultants, setConsultants] = useState<ConsultantWithOffice[]>([]);
  const [distributionQuantity, setDistributionQuantity] = useState(5);
  const [selectedConsultor, setSelectedConsultor] = useState("");
  const [selectedDistributionConsultants, setSelectedDistributionConsultants] = useState<string[]>([]);
  const [offices, setOffices] = useState<{ id: string; name: string; code?: string | null }[]>([]);
  const [selectedOfficeId, setSelectedOfficeId] = useState("");
  const [batches, setBatches] = useState<CampaignBatch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [message, setMessage] = useState("");
  const isMaster = session?.user.role === "MASTER";

  useEffect(() => {
    if (status === "authenticated" && session?.user.role !== "MASTER") {
      router.replace("/board");
    }
  }, [status, session, router]);

  const conversao = useMemo(() => {
    if (!detail) return 0;
    return detail.resumo.total ? detail.resumo.ganhos / detail.resumo.total : 0;
  }, [detail]);

  const filteredConsultants = useMemo(() => {
    if (!selectedOfficeId) return [];
    return consultants.filter((consultant) => consultant.officeId === selectedOfficeId);
  }, [consultants, selectedOfficeId]);

  const selectedOffice = useMemo(() => offices.find((office) => office.id === selectedOfficeId), [
    offices,
    selectedOfficeId,
  ]);

  useEffect(() => {
    if (!selectedOfficeId && offices.length > 0) {
      setSelectedOfficeId(offices[0].id);
    }
  }, [offices, selectedOfficeId]);

  useEffect(() => {
    setSelectedDistributionConsultants((prev) =>
      prev.filter((id) => filteredConsultants.some((c) => c.id === id))
    );
    if (selectedConsultor && !filteredConsultants.some((c) => c.id === selectedConsultor)) {
      setSelectedConsultor("");
    }
  }, [filteredConsultants, selectedConsultor]);

  const loadDetail = useCallback(async () => {
    const res = await fetch(`/api/campaigns/${id}`, { cache: "no-store" });
    if (res.ok) setDetail(await res.json());
  }, [id]);

  const loadDistribution = useCallback(async () => {
    if (!selectedOfficeId) return;
    const params = new URLSearchParams({ officeId: selectedOfficeId });
    const res = await fetch(`/api/campaigns/${id}/distribution?${params.toString()}`, { cache: "no-store" });
    if (res.ok) {
      const json = await res.json();
      setDistribution(json.distribution ?? []);
    }
  }, [id, selectedOfficeId]);

  const loadLeads = useCallback(async () => {
    if (!selectedOfficeId) return;
    const params = new URLSearchParams();
    serverFilterKeys.forEach((key) => {
      const value = filters[key];
      if (value) {
        params.append(key, value);
      }
    });
    params.append("officeId", selectedOfficeId);
    const res = await fetch(`/api/campaigns/${id}/leads?${params.toString()}`, { cache: "no-store" });
    if (res.ok) {
      const json = await res.json();
      setLeads(json.items ?? []);
    }
  }, [filters, id, selectedOfficeId]);

  const loadLogs = useCallback(async () => {
    const res = await fetch(`/api/campaign/${id}/logs`, { cache: "no-store" });
    if (res.ok) setLogs(await res.json());
  }, [id]);

  const loadAudit = useCallback(async () => {
    const res = await fetch(`/api/campaign/${id}/audit`, { cache: "no-store" });
    if (res.ok) setAudit(await res.json());
  }, [id]);

  const loadConsultants = useCallback(async () => {
    const res = await fetch("/api/admin/users", { cache: "no-store" });
    if (res.ok) {
      type ApiUser = {
        id: string;
        name?: string | null;
        email?: string | null;
        role: string;
        office?: { id?: string | null; name?: string | null; code?: string | null } | null;
        escritorio?: string | null;
        owner?: { escritorio?: string | null } | null;
      };
      const users = (await res.json()) as ApiUser[];
      const onlyConsultants = users.filter((u) => u.role === "CONSULTOR");
      setConsultants(
        onlyConsultants.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          officeId: u.office?.id ?? null,
          officeName: u.office?.name ?? u.escritorio ?? u.owner?.escritorio ?? "",
          officeCode: u.office?.code ?? u.escritorio ?? u.owner?.escritorio ?? null,
        }))
      );
    }
  }, []);

  const loadOffices = useCallback(async () => {
    const res = await fetch("/api/admin/offices", { cache: "no-store" });
    if (!res.ok) return;
    setOffices(await res.json());
  }, []);

  const loadBatches = useCallback(async () => {
    const res = await fetch("/api/admin/import-batches", { cache: "no-store" });
    if (!res.ok) return;
    const json = (await res.json()) as CampaignBatch[];
    const filtered = json.filter((batch) => batch.campaignId === id);
    setBatches(filtered);
    setSelectedBatchId((prev) => {
      if (filtered.some((batch) => batch.id === prev)) {
        return prev;
      }
      return filtered[0]?.id ?? "";
    });
  }, [id]);

  useEffect(() => {
    if (status === "authenticated" && id) {
      loadDetail();
      loadConsultants();
      loadBatches();
      loadOffices();
    }
  }, [status, id, loadDetail, loadConsultants, loadBatches, loadOffices]);

  useEffect(() => {
    if (status === "authenticated" && id && selectedOfficeId) {
      loadDistribution();
    }
  }, [status, id, selectedOfficeId, loadDistribution]);

  useEffect(() => {
    if (status === "authenticated" && id && selectedOfficeId) {
      loadLeads();
    }
  }, [status, id, selectedOfficeId, filters, loadLeads]);

  useEffect(() => {
    if (status === "authenticated" && id) {
      loadLogs();
      loadAudit();
    }
  }, [status, id, loadLogs, loadAudit]);

  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      if (selectedOfficeId && (!lead.officeId || lead.officeId !== selectedOfficeId)) {
        return false;
      }
      if (filters.documento) {
        const docValue = (lead.documento ?? lead.cnpj ?? "").toLowerCase();
        if (!docValue.includes(filters.documento.toLowerCase())) return false;
      }
      if (filters.empresa) {
        const companyValue = (lead.razaoSocial ?? lead.nomeFantasia ?? "").toLowerCase();
        if (!companyValue.includes(filters.empresa.toLowerCase())) return false;
      }
      const revenueValue = parseRevenue(lead.vlFatPresumido);
      if (filters.faturamentoMin) {
        const minValue = Number(filters.faturamentoMin);
        if (Number.isFinite(minValue) && (revenueValue === null || revenueValue < minValue)) return false;
      }
      if (filters.faturamentoMax) {
        const maxValue = Number(filters.faturamentoMax);
        if (Number.isFinite(maxValue) && (revenueValue === null || revenueValue > maxValue)) return false;
      }
      if (filters.telefone === "with" && !hasAnyPhone(lead)) return false;
      if (filters.telefone === "without" && hasAnyPhone(lead)) return false;
      return true;
    });
  }, [leads, filters, selectedOfficeId]);

  const officeTotals = useMemo(
    () =>
      distribution.reduce(
        (acc, row) => ({
          assigned: acc.assigned + row.totalAtribuidos,
          worked: acc.worked + row.trabalhados,
          remaining: acc.remaining + row.restantes,
        }),
        { assigned: 0, worked: 0, remaining: 0 }
      ),
    [distribution]
  );

  async function distribute() {
    if (!isMaster) {
      setMessage("Apenas master pode distribuir.");
      return;
    }
    if (!selectedOfficeId) {
      setMessage("Selecione um escritório antes de distribuir.");
      return;
    }
    setMessage("");
    if (selectedDistributionConsultants.length === 0) {
      setMessage("Selecione ao menos um consultor.");
      return;
    }
    if (!distributionQuantity || distributionQuantity < 1) {
      setMessage("Quantidade por consultor inválida.");
      return;
    }
    const res = await fetch(`/api/campaigns/${id}/distribution`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        officeId: selectedOfficeId,
        consultantIds: selectedDistributionConsultants,
        quantityPerConsultant: distributionQuantity,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      setMessage(err?.message ?? "Erro ao distribuir.");
      return;
    }
    setMessage("Distribuição realizada.");
    await Promise.all([loadDetail(), loadDistribution(), loadLeads(), loadLogs()]);
  }

  async function autoDistribute() {
    if (!isMaster) {
      setMessage("Apenas master pode distribuir.");
      return;
    }
    if (!selectedOfficeId) {
      setMessage("Selecione um escritório antes de distribuir.");
      return;
    }
    setMessage("");
    const res = await fetch(`/api/campaigns/${id}/distribution`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        officeId: selectedOfficeId,
        consultantIds: selectedDistributionConsultants,
        auto: true,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      setMessage(err?.message ?? "Erro ao distribuir automaticamente.");
      return;
    }
    setMessage("Distribuição igualitária aplicada.");
    await Promise.all([loadDetail(), loadDistribution(), loadLeads(), loadLogs()]);
  }

  async function deleteBatch() {
    if (!isMaster) {
      setMessage("Apenas master pode excluir lotes.");
      return;
    }
    if (!selectedBatchId) {
      setMessage("Selecione um lote para excluir.");
      return;
    }
    const res = await fetch(`/api/admin/import-batches/${selectedBatchId}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      setMessage(err?.message ?? "Não foi possível excluir o lote.");
      return;
    }
    setMessage("Lote excluído.");
    await Promise.all([loadDetail(), loadDistribution(), loadLeads(), loadBatches()]);
  }

  async function resetCampaign() {
    if (!isMaster) {
      setMessage("Apenas master pode resetar a campanha.");
      return;
    }
    if (!window.confirm("Deseja resetar esta campanha? As atribuições serão removidas, mas os leads permanecerão.")) {
      return;
    }
    const res = await fetch(`/api/campaigns/${id}/reset`, { method: "POST" });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      setMessage(err?.message ?? "Erro ao resetar campanha.");
      return;
    }
    setMessage("Campanha resetada.");
    await Promise.all([loadDetail(), loadDistribution(), loadLeads(), loadLogs()]);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Campanha</p>
          <h1 className="text-2xl font-semibold text-slate-900">{detail?.campaign.nome ?? "Campanha"}</h1>
          <p className="text-sm text-slate-500">{detail?.campaign.descricao}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadLogs}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-100"
          >
            Logs
          </button>
          <button
            onClick={() => {
              window.location.href = `/api/admin/export`;
            }}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-100"
          >
            Exportar campanha
          </button>
          <button
            onClick={() => router.back()}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-100"
          >
            Voltar
          </button>
        </div>
      </div>

      {message ? <div className="text-sm text-slate-700">{message}</div> : null}

      <div className="rounded-2xl border bg-white/70 backdrop-blur p-4 shadow-sm grid grid-cols-2 md:grid-cols-3 gap-3">
        <ResumoCard title="Total" value={detail?.resumo.total ?? 0} />
        <ResumoCard title="Atribuídos" value={detail?.resumo.atribuidos ?? 0} />
        <ResumoCard title="Estoque" value={detail?.resumo.estoque ?? 0} />
        <ResumoCard title="Ganhos" value={detail?.resumo.ganhos ?? 0} />
        <ResumoCard title="Perdidos" value={detail?.resumo.perdidos ?? 0} />
        <ResumoCard title="Conversão" value={`${Math.round(conversao * 100)}%`} />
        {audit ? (
          <>
            <ResumoCard title="Telefones inválidos" value={audit.invalidPhones} />
            <ResumoCard title="Duplicados" value={audit.duplicated} />
          </>
        ) : null}
      </div>

      <div className="rounded-2xl border bg-white/70 backdrop-blur p-4 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Distribuição de Leads</h2>
        </div>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-slate-600">
              Distribuir considerando escritório (SAFE TI / JLC Tech)
            </label>
            <select
              value={selectedOfficeId}
              onChange={(e) => setSelectedOfficeId(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            >
              <option value="">Selecione um escritório</option>
              {offices.map((office) => (
                <option key={office.id} value={office.id}>
                  {office.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500">
              {selectedOfficeId
                ? `Escritório em foco: ${selectedOffice?.name ?? "não informado"}`
                : "Selecione o escritório para liberar os consultores e filtrar os dados."}
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-slate-600">Consultor (para reatribuir)</label>
              <select
                value={selectedConsultor}
                onChange={(e) => setSelectedConsultor(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                disabled={!selectedOfficeId}
              >
                <option value="">Selecione</option>
                {filteredConsultants.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name ?? c.email}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-600">Consultores para distribuir</label>
              <select
                multiple
                value={selectedDistributionConsultants}
                onChange={(e) =>
                  setSelectedDistributionConsultants(Array.from(e.target.selectedOptions, (option) => option.value))
                }
                className="h-32 w-full rounded-lg border px-3 py-2 text-sm"
                disabled={!selectedOfficeId}
              >
                {filteredConsultants.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name ?? c.email}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500">
                {filteredConsultants.length === 0
                  ? "Nenhum consultor cadastrado para este escritório."
                  : "Use Ctrl/Cmd para selecionar mais de um consultor."}
              </p>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-600">Quantidade por consultor</label>
              <input
                type="number"
                min={1}
                value={distributionQuantity}
                onChange={(e) => setDistributionQuantity(Math.max(1, Number(e.target.value)))}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                disabled={!selectedOfficeId}
              />
            </div>
            <div className="space-y-3">
              <label className="text-xs text-slate-600">Ações</label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={distribute}
                  disabled={!isMaster || !selectedOfficeId || selectedDistributionConsultants.length === 0}
                  className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:bg-slate-400"
                >
                  Distribuir leads
                </button>
                <button
                  onClick={autoDistribute}
                  disabled={!isMaster || !selectedOfficeId}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold disabled:border-slate-200"
                >
                  Distribuição igualitária automática
                </button>
              </div>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="py-2 pr-3">Consultor</th>
                <th className="py-2 pr-3">Escritório</th>
                <th className="py-2 pr-3">Atribuídos</th>
                <th className="py-2 pr-3">Trabalhados</th>
                <th className="py-2 pr-3">Restantes</th>
                <th className="py-2 pr-3">% concluído</th>
                <th className="py-2 pr-3">Tempo médio</th>
                <th className="py-2 pr-3">Ganhos</th>
                <th className="py-2 pr-3">Perdidos</th>
                <th className="py-2 pr-3">Última atividade</th>
              </tr>
            </thead>
            <tbody>
              {distribution.map((row) => (
                <tr key={row.consultantId} className="border-b last:border-b-0">
                  <td className="py-2 pr-3">{row.consultantName}</td>
                  <td className="py-2 pr-3">{row.officeName || "-"}</td>
                  <td className="py-2 pr-3">{row.totalAtribuidos}</td>
                  <td className="py-2 pr-3">{row.trabalhados}</td>
                  <td className="py-2 pr-3">{row.restantes}</td>
                  <td className="py-2 pr-3">{row.percentConcluido ?? 0}%</td>
                  <td className="py-2 pr-3">{formatDuration(row.tempoMedioTratativaMs)}</td>
                  <td className="py-2 pr-3">{row.fechados}</td>
                  <td className="py-2 pr-3">{row.perdidos}</td>
                  <td className="py-2 pr-3">
                    {row.ultimaAtividadeAt ? new Date(row.ultimaAtividadeAt).toLocaleString("pt-BR") : "-"}
                  </td>
                </tr>
              ))}
              {distribution.length === 0 ? (
                <tr>
                  <td className="py-2 pr-3 text-sm text-slate-500" colSpan={10}>
                    Sem dados de distribuição.
                  </td>
                </tr>
              ) : null}
            </tbody>
            {distribution.length > 0 ? (
              <tfoot>
                <tr className="text-left text-slate-500 border-t">
                  <td className="py-2 pr-3 font-semibold" colSpan={2}>
                    Totais do {selectedOffice?.name ?? "escritório"}
                  </td>
                  <td className="py-2 pr-3 font-semibold">{officeTotals.assigned}</td>
                  <td className="py-2 pr-3 font-semibold">{officeTotals.worked}</td>
                  <td className="py-2 pr-3 font-semibold">{officeTotals.remaining}</td>
                  <td className="py-2 pr-3" colSpan={5} />
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </div>

      <div className="rounded-2xl border bg-white/70 backdrop-blur p-4 shadow-sm space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Estoque da campanha</h2>
            <p className="text-xs text-slate-500">Filtros aplicados apenas no front-end.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={loadLeads}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-100"
            >
              Atualizar
            </button>
            {isMaster ? (
              <button
                onClick={resetCampaign}
                className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                Resetar campanha
              </button>
            ) : null}
          </div>
        </div>
        {batches.length > 0 && (
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm text-slate-700">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedBatchId}
                onChange={(e) => setSelectedBatchId(e.target.value)}
                className="w-full max-w-sm rounded-lg border px-3 py-2 text-sm"
              >
                {batches.map((batch) => (
                  <option key={batch.id} value={batch.id}>
                    {batch.nomeArquivoOriginal} - {new Date(batch.createdAt).toLocaleDateString("pt-BR")}
                  </option>
                ))}
              </select>
              <button
                onClick={deleteBatch}
                disabled={!isMaster}
                className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 disabled:border-slate-200 disabled:text-slate-400"
              >
                Excluir lote desta campanha
              </button>
            </div>
            <p className="text-xs text-slate-500">A exclusão remove apenas os leads daquele lote importado.</p>
          </div>
        )}
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
            <select
              value={filters.status}
              onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value as LeadStatus | "" }))}
              className="rounded-lg border px-3 py-2 text-sm"
            >
              <option value="">Todos os status</option>
              {Object.values(LeadStatus).map((statusOption) => (
                <option key={statusOption} value={statusOption}>
                  {statusOption}
                </option>
              ))}
            </select>
            <select
              value={filters.consultorId}
              onChange={(e) => setFilters((prev) => ({ ...prev, consultorId: e.target.value }))}
              className="rounded-lg border px-3 py-2 text-sm"
            >
              <option value="">Todos os consultores</option>
              {consultants.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name ?? c.email}
                </option>
              ))}
            </select>
            <input
              placeholder="Cidade"
              value={filters.cidade}
              onChange={(e) => setFilters((prev) => ({ ...prev, cidade: e.target.value }))}
              className="rounded-lg border px-3 py-2 text-sm"
            />
            <input
              placeholder="UF"
              value={filters.uf}
              onChange={(e) => setFilters((prev) => ({ ...prev, uf: e.target.value }))}
              className="rounded-lg border px-3 py-2 text-sm"
            />
            <input
              placeholder="Estratégia"
              value={filters.estrategia}
              onChange={(e) => setFilters((prev) => ({ ...prev, estrategia: e.target.value }))}
              className="rounded-lg border px-3 py-2 text-sm"
            />
            <input
              placeholder="Vertical"
              value={filters.vertical}
              onChange={(e) => setFilters((prev) => ({ ...prev, vertical: e.target.value }))}
              className="rounded-lg border px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
            <input
              placeholder="Documento"
              value={filters.documento}
              onChange={(e) => setFilters((prev) => ({ ...prev, documento: e.target.value }))}
              className="rounded-lg border px-3 py-2 text-sm"
            />
            <input
              placeholder="Empresa"
              value={filters.empresa}
              onChange={(e) => setFilters((prev) => ({ ...prev, empresa: e.target.value }))}
              className="rounded-lg border px-3 py-2 text-sm"
            />
            <input
              placeholder="Faturamento mínimo"
              type="number"
              value={filters.faturamentoMin}
              onChange={(e) => setFilters((prev) => ({ ...prev, faturamentoMin: e.target.value }))}
              className="rounded-lg border px-3 py-2 text-sm"
            />
            <input
              placeholder="Faturamento máximo"
              type="number"
              value={filters.faturamentoMax}
              onChange={(e) => setFilters((prev) => ({ ...prev, faturamentoMax: e.target.value }))}
              className="rounded-lg border px-3 py-2 text-sm"
            />
            <select
              value={filters.telefone}
              onChange={(e) => setFilters((prev) => ({ ...prev, telefone: e.target.value as LeadFilters["telefone"] }))}
              className="rounded-lg border px-3 py-2 text-sm"
            >
              <option value="all">Telefones (todos)</option>
              <option value="with">Com telefones</option>
              <option value="without">Sem telefones</option>
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="py-2 pr-3">Documento</th>
                <th className="py-2 pr-3">Empresa</th>
                <th className="py-2 pr-3">Cidade/UF</th>
                <th className="py-2 pr-3">Faturamento</th>
                <th className="py-2 pr-3">Telefones</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Consultor</th>
                <th className="py-2 pr-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.map((lead) => (
                <tr key={lead.id} className="border-b last:border-b-0">
                  <td className="py-2 pr-3">{lead.documento ?? lead.cnpj ?? "-"}</td>
                  <td className="py-2 pr-3">{lead.razaoSocial ?? lead.nomeFantasia ?? "-"}</td>
                  <td className="py-2 pr-3">
                    {lead.cidade ?? "-"} {lead.estado ? `/${lead.estado}` : ""}
                  </td>
                  <td className="py-2 pr-3">{lead.vlFatPresumido ?? "-"}</td>
                  <td className="py-2 pr-3">
                    {[lead.telefone1, lead.telefone2, lead.telefone3].filter(Boolean).join(" / ") || "-"}
                  </td>
                  <td className="py-2 pr-3">{lead.status}</td>
                  <td className="py-2 pr-3">{lead.consultor?.name ?? lead.consultor?.email ?? "-"}</td>
                  <td className="py-2 pr-3 space-x-2">
                    <button
                      onClick={async () => {
                        if (!selectedConsultor) return;
                        await fetch("/api/lead/reassign", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ leadId: lead.id, consultantId: selectedConsultor }),
                        });
                        await loadLeads();
                      }}
                      className="text-xs text-blue-700 underline"
                    >
                      Reatribuir
                    </button>
                    <button
                      onClick={async () => {
                        await fetch(`/api/lead/${lead.id}/update`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ status: LeadStatus.PERDIDO }),
                        });
                        await loadLeads();
                      }}
                      className="text-xs text-red-600 underline"
                    >
                      Invalidar
                    </button>
                  </td>
                </tr>
              ))}
              {filteredLeads.length === 0 ? (
                <tr>
                  <td className="py-2 pr-3 text-sm text-slate-500" colSpan={8}>
                    Nenhum lead encontrado.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function hasAnyPhone(lead: LeadItem) {
  return Boolean(lead.telefone1 || lead.telefone2 || lead.telefone3);
}

function parseRevenue(value?: string | null) {
  if (!value) return null;
  const normalized = value
    .replace(/[^\d.,]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDuration(ms: number) {
  if (!ms || Number.isNaN(ms)) return "-";
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function ResumoCard({ title, value }: { title: string; value: number | string }) {
  return (
    <div className="rounded-xl border bg-white p-3 shadow-sm">
      <p className="text-xs uppercase text-slate-500">{title}</p>
      <p className="text-xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}
