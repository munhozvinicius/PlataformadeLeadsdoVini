"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { LeadStatus } from "@prisma/client";
import { zipSync } from "fflate";

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
  duplicatedLeads?: number;
  notAttributedLeads?: number;
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

type TabKey = "campaign" | "import" | "distribution" | "recapture";

const serverFilterKeys: Array<keyof LeadFilters> = [
  "status",
  "consultorId",
  "cidade",
  "uf",
  "estrategia",
  "vertical",
];

const RECAPTURE_STATUSES: LeadStatus[] = [LeadStatus.NOVO, LeadStatus.EM_CONTATO, LeadStatus.EM_NEGOCIACAO];

export default function CampaignDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { data: session, status } = useSession();

  const [activeTab, setActiveTab] = useState<TabKey>("campaign");
  const [detail, setDetail] = useState<CampaignDetail | null>(null);
  const [audit, setAudit] = useState<{ total: number; invalidPhones: number; duplicated: number; invalids: number } | null>(
    null
  );
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
  const [offices, setOffices] = useState<{ id: string; name: string; code?: string | null }[]>([]);
  const [officeDraft, setOfficeDraft] = useState("");
  const [officeFilter, setOfficeFilter] = useState("");
  const [selectedConsultor, setSelectedConsultor] = useState("");
  const [selectedDistributionConsultants, setSelectedDistributionConsultants] = useState<string[]>([]);
  const [distributionQuantity, setDistributionQuantity] = useState(5);
  const [distributionMode, setDistributionMode] = useState<"PER_CONSULTANT" | "TOTAL">("PER_CONSULTANT");
  const [totalQuantity, setTotalQuantity] = useState(20);
  const [onlyUnassigned, setOnlyUnassigned] = useState(true);
  const [onlyNewLeads, setOnlyNewLeads] = useState(true);
  const [selectedStatuses, setSelectedStatuses] = useState<LeadStatus[]>([LeadStatus.NOVO]);
  const [onlyWithPhones, setOnlyWithPhones] = useState(false);
  const [onlyValidPhones, setOnlyValidPhones] = useState(false);
  const [minRevenue, setMinRevenue] = useState("");
  const [maxRevenue, setMaxRevenue] = useState("");
  const [respectOffices, setRespectOffices] = useState(true);
  const [distributionResult, setDistributionResult] = useState<
    | {
        totalEligible: number;
        totalDistributed: number;
        perConsultant: { consultantId: string; name: string; email: string; distributed: number }[];
      }
    | null
  >(null);
  const [distributing, setDistributing] = useState(false);
  const [consultantsLoading, setConsultantsLoading] = useState(false);
  const [batches, setBatches] = useState<CampaignBatch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [batchToDelete, setBatchToDelete] = useState<CampaignBatch | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const [message, setMessage] = useState("");

  const isConsultant = session?.user.role === "CONSULTOR";
  const isLoadingSession = status === "loading";
  const canReset = session?.user.role === "MASTER" || session?.user.role === "GERENTE_SENIOR";

  useEffect(() => {
    if (status === "authenticated" && isConsultant) {
      router.replace("/board");
    }
  }, [status, isConsultant, router]);

  const conversao = useMemo(() => {
    if (!detail) return 0;
    return detail.resumo.total ? detail.resumo.ganhos / detail.resumo.total : 0;
  }, [detail]);

  const filteredConsultants = useMemo(() => {
    if (!officeFilter) return consultants;
    return consultants.filter((consultant) => consultant.officeId === officeFilter);
  }, [consultants, officeFilter]);

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
    if (!officeFilter) return;
    const params = new URLSearchParams({ officeId: officeFilter });
    const res = await fetch(`/api/campaigns/${id}/distribution?${params.toString()}`, { cache: "no-store" });
    if (res.ok) {
      const json = await res.json();
      setDistribution(json.distribution ?? []);
    }
  }, [id, officeFilter]);

  const loadLeads = useCallback(async () => {
    if (!officeFilter) return;
    const params = new URLSearchParams();
    serverFilterKeys.forEach((key) => {
      const value = filters[key];
      if (value) {
        params.append(key, value);
      }
    });
    params.append("officeId", officeFilter);
    const res = await fetch(`/api/campaigns/${id}/leads?${params.toString()}`, { cache: "no-store" });
    if (res.ok) {
      const json = await res.json();
      setLeads(json.items ?? []);
    }
  }, [filters, id, officeFilter]);

  const loadAudit = useCallback(async () => {
    const res = await fetch(`/api/campaign/${id}/audit`, { cache: "no-store" });
    if (res.ok) setAudit(await res.json());
  }, [id]);

  const loadConsultants = useCallback(
    async (appliedOffice?: string) => {
      setConsultantsLoading(true);
      const params = new URLSearchParams();
      if (appliedOffice) params.append("officeId", appliedOffice);
      const res = await fetch(`/api/campaigns/${id}/consultants?${params.toString()}`, { cache: "no-store" });
      setConsultantsLoading(false);
      if (res.ok) {
        type ApiUser = {
          id: string;
          name?: string | null;
          email?: string | null;
          officeId?: string | null;
          officeName?: string | null;
        };
        const users = (await res.json()) as ApiUser[];
        setConsultants(
          users.map((u) => ({
            id: u.id,
            name: u.name,
            email: u.email,
            officeId: u.officeId ?? null,
            officeName: u.officeName ?? "",
            officeCode: null,
          }))
        );
      } else {
        setConsultants([]);
      }
    },
    [id]
  );

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
      loadConsultants(officeFilter);
      loadBatches();
      loadOffices();
      loadAudit();
    }
  }, [status, id, loadDetail, loadConsultants, loadBatches, loadOffices, loadAudit, officeFilter]);

  useEffect(() => {
    if (status === "authenticated" && id && officeFilter) {
      loadDistribution();
      loadLeads();
      loadConsultants(officeFilter);
    }
  }, [status, id, officeFilter, loadDistribution, loadLeads, loadConsultants]);

  useEffect(() => {
    if (!officeDraft && offices.length > 0) {
      setOfficeDraft(offices[0].id);
      setOfficeFilter((prev) => prev || offices[0].id);
    }
  }, [offices, officeDraft]);

  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      if (officeFilter && (!lead.officeId || lead.officeId !== officeFilter)) {
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
  }, [leads, filters, officeFilter]);

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

  async function handleDistribute() {
    if (selectedDistributionConsultants.length === 0) {
      setMessage("Selecione ao menos um consultor.");
      return;
    }
    if (!distributionQuantity || distributionQuantity < 1) {
      setMessage("Quantidade por consultor inválida.");
      return;
    }

    setMessage("");
    setDistributing(true);
    const res = await fetch(`/api/campaigns/${id}/distribute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        consultantIds: selectedDistributionConsultants,
        quantityPerConsultant:
          distributionMode === "PER_CONSULTANT"
            ? distributionQuantity
            : Math.max(1, Math.ceil(totalQuantity / Math.max(1, selectedDistributionConsultants.length))),
        officeId: officeFilter || undefined,
        filters: {
          onlyNew: onlyNewLeads,
          onlyUnassigned,
          onlyWithPhone: onlyWithPhones,
          ignoreInvalidPhones: onlyValidPhones,
          faturamentoMin: minRevenue ? Number(minRevenue) : undefined,
          faturamentoMax: maxRevenue ? Number(maxRevenue) : undefined,
        },
      }),
    });
    setDistributing(false);

    if (!res.ok) {
      const err = await res.json().catch(() => null);
      setMessage(err?.message ?? "Erro ao distribuir.");
      return;
    }
    const json = await res.json();
    setDistributionResult(json);
    const totalDistributed = Number(json.totalDistributed ?? 0);
    setMessage(`Distribuição realizada: ${Number.isFinite(totalDistributed) ? totalDistributed : 0} leads.`);
    await Promise.all([loadDetail(), loadDistribution(), loadLeads()]);
  }

  async function deleteBatch() {
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

  async function handleImport(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setImportMessage("");
    if (!importFile) {
      setImportMessage("Selecione o arquivo da planilha.");
      return;
    }
    const buffer = await importFile.arrayBuffer();
    const zipped = zipSync({ [importFile.name]: new Uint8Array(buffer) });
    const zippedArray = new Uint8Array(zipped);

    const formData = new FormData();
    formData.append("file", new Blob([zippedArray], { type: "application/zip" }), `${importFile.name}.zip`);
    formData.append("compressed", "true");
    formData.append("campanhaId", id);
    formData.append("assignmentType", "none");

    setImportLoading(true);
    const res = await fetch("/api/campanhas/import", {
      method: "POST",
      body: formData,
    });
    setImportLoading(false);
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      setImportMessage(err?.message ?? "Erro ao importar planilha.");
      return;
    }
    const json = await res.json();
    setImportMessage(
      `Importação concluída: ${json.importedLeads} criados, ${json.duplicatedLeads} duplicados, em estoque: ${json.notAttributedLeads}.`
    );
    await Promise.all([loadDetail(), loadBatches(), loadLeads()]);
  }

  async function resetCampaign() {
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
    await Promise.all([loadDetail(), loadDistribution(), loadLeads()]);
  }

  if (isLoadingSession || status === "unauthenticated" || isConsultant) {
    return null;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header className="rounded-2xl border border-slate-200 bg-white/80 backdrop-blur p-4 shadow-sm space-y-2">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Campanha</p>
            <h1 className="text-2xl font-semibold text-slate-900">{detail?.campaign.nome ?? "Campanha"}</h1>
            <p className="text-sm text-slate-500">{detail?.campaign.descricao}</p>
          </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => window.open(`/api/campaign/${id}/logs`, "_blank")}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-100"
          >
            Logs
          </button>
          <button
            onClick={() => router.back()}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-100"
          >
            Voltar
            </button>
            <button
              onClick={() => (window.location.href = "/api/admin/export")}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-100"
            >
              Exportar campanha
            </button>
          <button
            onClick={loadDetail}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-100"
          >
            Atualizar
          </button>
          {canReset ? (
            <button
              onClick={resetCampaign}
              className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 hover:bg-amber-100"
            >
              Resetar
            </button>
          ) : null}
        </div>
      </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
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
      </header>

      <div className="rounded-2xl border border-slate-200 bg-white/80 backdrop-blur p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs text-slate-500">Contexto</p>
            <p className="text-sm font-semibold text-slate-800">Selecione o escritório e clique em Aplicar</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={officeDraft}
              onChange={(e) => setOfficeDraft(e.target.value)}
              className="rounded-lg border px-3 py-2 text-sm"
            >
              <option value="">Todos os escritórios</option>
              {offices.map((office) => (
                <option key={office.id} value={office.id}>
                  {office.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => setOfficeFilter(officeDraft)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-100"
            >
              Aplicar
            </button>
            <span className="text-xs text-slate-500">
              {officeFilter ? "Filtrando por escritório" : "Mostrando visão geral"}
            </span>
          </div>
        </div>
        {message ? <div className="text-sm text-slate-700">{message}</div> : null}
      </div>

      <Tabs active={activeTab} onChange={setActiveTab} />

      {activeTab === "campaign" ? (
        <CampaignTab
          audit={audit}
          distribution={distribution}
          officeTotals={officeTotals}
          filteredLeads={filteredLeads}
          filters={filters}
          setFilters={setFilters}
          loadLeads={loadLeads}
          consultants={consultants}
          selectedConsultor={selectedConsultor}
          setSelectedConsultor={setSelectedConsultor}
          selectedBatchId={selectedBatchId}
          setSelectedBatchId={setSelectedBatchId}
          batches={batches}
          deleteBatch={deleteBatch}
        />
      ) : null}

      {activeTab === "import" ? (
        <ImportTab
          handleImport={handleImport}
          importFile={importFile}
          setImportFile={setImportFile}
          importLoading={importLoading}
          importMessage={importMessage}
          batches={batches}
          setBatchToDelete={setBatchToDelete}
        />
      ) : null}

      {activeTab === "distribution" ? (
        <DistributionTab
          consultants={filteredConsultants}
          consultantsLoading={consultantsLoading}
          selectedDistributionConsultants={selectedDistributionConsultants}
          setSelectedDistributionConsultants={setSelectedDistributionConsultants}
          distributionQuantity={distributionQuantity}
          setDistributionQuantity={setDistributionQuantity}
          distributionMode={distributionMode}
          setDistributionMode={setDistributionMode}
          totalQuantity={totalQuantity}
          setTotalQuantity={setTotalQuantity}
          onlyNewLeads={onlyNewLeads}
          setOnlyNewLeads={setOnlyNewLeads}
          selectedStatuses={selectedStatuses}
          setSelectedStatuses={setSelectedStatuses}
          onlyUnassigned={onlyUnassigned}
          setOnlyUnassigned={setOnlyUnassigned}
          onlyWithPhones={onlyWithPhones}
          setOnlyWithPhones={setOnlyWithPhones}
          onlyValidPhones={onlyValidPhones}
          setOnlyValidPhones={setOnlyValidPhones}
          minRevenue={minRevenue}
          maxRevenue={maxRevenue}
          setMinRevenue={setMinRevenue}
          setMaxRevenue={setMaxRevenue}
          respectOffices={respectOffices}
          setRespectOffices={setRespectOffices}
          handleDistribute={handleDistribute}
          remainingStock={detail?.resumo.estoque ?? 0}
          assigned={detail?.resumo.atribuidos ?? 0}
          distributing={distributing}
          distributionResult={distributionResult}
          officeFilter={officeFilter}
        />
      ) : null}

      {activeTab === "recapture" ? (
        <RecaptureTab
          leads={filteredLeads}
          consultants={filteredConsultants}
          selectedConsultor={selectedConsultor}
          setSelectedConsultor={setSelectedConsultor}
        />
      ) : null}

      {batchToDelete ? (
        <ConfirmDeleteBatch batch={batchToDelete} onCancel={() => setBatchToDelete(null)} onConfirm={deleteBatch} />
      ) : null}
    </div>
  );
}

function Tabs({ active, onChange }: { active: TabKey; onChange: (tab: TabKey) => void }) {
  const tabs: { key: TabKey; label: string }[] = [
    { key: "campaign", label: "Campanha" },
    { key: "import", label: "Importar Base" },
    { key: "distribution", label: "Distribuição" },
    { key: "recapture", label: "Repescagem" },
  ];
  return (
    <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white/70 p-2 shadow-sm">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
            active === tab.key ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function CampaignTab({
  audit,
  distribution,
  officeTotals,
  filteredLeads,
  filters,
  setFilters,
  loadLeads,
  consultants,
  selectedConsultor,
  setSelectedConsultor,
  selectedBatchId,
  setSelectedBatchId,
  batches,
  deleteBatch,
}: {
  audit: { total: number; invalidPhones: number; duplicated: number; invalids: number } | null;
  distribution: DistributionRow[];
  officeTotals: { assigned: number; worked: number; remaining: number };
  filteredLeads: LeadItem[];
  filters: LeadFilters;
  setFilters: Dispatch<SetStateAction<LeadFilters>>;
  loadLeads: () => Promise<void>;
  consultants: ConsultantWithOffice[];
  selectedConsultor: string;
  setSelectedConsultor: (id: string) => void;
  selectedBatchId: string;
  setSelectedBatchId: Dispatch<SetStateAction<string>>;
  batches: CampaignBatch[];
  deleteBatch: () => Promise<void>;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-white/80 p-4 shadow-sm space-y-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Visão geral da campanha</h2>
            <p className="text-xs text-slate-500">
              Métricas principais, perdas e desempenho por consultor nesta campanha.
            </p>
          </div>
          {audit ? (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              Total bruto: {audit.total}
            </span>
          ) : null}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
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
                <tr className="border-t text-left text-slate-500">
                  <td className="py-2 pr-3 font-semibold" colSpan={2}>
                    Totais do escritório selecionado
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

      <div className="rounded-2xl border bg-white/80 p-4 shadow-sm space-y-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Estoque da campanha</h2>
            <p className="text-xs text-slate-500">
              Filtros aplicados apenas no front-end. Continue reatribuindo ou invalidando se necessário.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={loadLeads}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-100"
            >
              Atualizar
            </button>
            <div className="flex items-center gap-2">
              <select
                value={selectedConsultor}
                onChange={(e) => setSelectedConsultor(e.target.value)}
                className="rounded-lg border px-3 py-2 text-sm"
              >
                <option value="">Selecione um consultor para reatribuição</option>
                {consultants.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name ?? c.email}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <LeadFiltersForm filters={filters} setFilters={setFilters} consultants={consultants} />

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
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

      {batches.length > 0 ? (
        <div className="rounded-xl border bg-white/80 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold text-slate-900">Lotes importados desta campanha</h3>
            <div className="flex items-center gap-2">
              <select
                value={selectedBatchId}
                onChange={(e) => setSelectedBatchId(e.target.value)}
                className="rounded-lg border px-3 py-2 text-sm"
              >
                {batches.map((batch) => (
                  <option key={batch.id} value={batch.id}>
                    {batch.nomeArquivoOriginal} - {new Date(batch.createdAt).toLocaleDateString("pt-BR")}
                  </option>
                ))}
              </select>
              <button
                onClick={deleteBatch}
                className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 disabled:border-slate-200 disabled:text-slate-400"
              >
                Excluir lote
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ImportTab({
  handleImport,
  importFile,
  setImportFile,
  importLoading,
  importMessage,
  batches,
  setBatchToDelete,
}: {
  handleImport: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  importFile: File | null;
  setImportFile: (file: File | null) => void;
  importLoading: boolean;
  importMessage: string;
  batches: CampaignBatch[];
  setBatchToDelete: (batch: CampaignBatch | null) => void;
}) {
  return (
    <div className="rounded-2xl border bg-white/80 p-4 shadow-sm space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Importar Base (campanha atual)</h2>
          <p className="text-sm text-slate-600">
            Upload direto para esta campanha. Selecione o Excel e importe; o arquivo será compactado automaticamente.
          </p>
        </div>
        <a href="/api/import/template" className="text-sm text-blue-700 underline">
          Baixar modelo de planilha (Excel)
        </a>
      </div>

      <form className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end" onSubmit={handleImport}>
        <div className="space-y-1 md:col-span-2">
          <label className="text-xs text-slate-600">Arquivo Excel</label>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
            className="w-full text-sm"
          />
        </div>
        <div className="md:col-span-1 flex gap-2">
          <button
            type="submit"
            disabled={importLoading || !importFile}
            className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {importLoading ? "Importando..." : "Importar base"}
          </button>
        </div>
      </form>
      {importMessage ? <div className="text-sm text-slate-700">{importMessage}</div> : null}

      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold text-slate-900">Importações desta campanha</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="py-2 pr-3">Arquivo</th>
                <th className="py-2 pr-3">Total lido</th>
                <th className="py-2 pr-3">Importados</th>
                <th className="py-2 pr-3">Duplicados</th>
                <th className="py-2 pr-3">Não atribuídos</th>
                <th className="py-2 pr-3">Criado em</th>
                <th className="py-2 pr-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((batch) => (
                <tr key={batch.id} className="border-b last:border-b-0">
                  <td className="py-2 pr-3">{batch.nomeArquivoOriginal}</td>
                  <td className="py-2 pr-3">{batch.totalLeads}</td>
                  <td className="py-2 pr-3">{batch.importedLeads ?? batch.totalLeads}</td>
                  <td className="py-2 pr-3">{batch.duplicatedLeads ?? 0}</td>
                  <td className="py-2 pr-3">{batch.notAttributedLeads ?? 0}</td>
                  <td className="py-2 pr-3">
                    {batch.createdAt ? new Date(batch.createdAt).toLocaleString("pt-BR") : "-"}
                  </td>
                  <td className="py-2 pr-3">
                    <button
                      onClick={() => setBatchToDelete(batch)}
                      className="text-xs text-red-600 underline"
                    >
                      Excluir batch
                    </button>
                  </td>
                </tr>
              ))}
              {batches.length === 0 ? (
                <tr>
                  <td className="py-2 pr-3 text-sm text-slate-500" colSpan={7}>
                    Nenhuma importação para esta campanha.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="mt-3 text-xs text-slate-500">
          Fluxo recomendado: criar campanha → clicar em &ldquo;Ver detalhes&rdquo; → usar a aba Importar Base.
        </div>
      </div>
    </div>
  );
}

function DistributionTab({
  consultants,
  consultantsLoading,
  selectedDistributionConsultants,
  setSelectedDistributionConsultants,
  distributionQuantity,
  setDistributionQuantity,
  distributionMode,
  setDistributionMode,
  totalQuantity,
  setTotalQuantity,
  onlyNewLeads,
  setOnlyNewLeads,
  selectedStatuses,
  setSelectedStatuses,
  onlyUnassigned,
  setOnlyUnassigned,
  onlyWithPhones,
  setOnlyWithPhones,
  onlyValidPhones,
  setOnlyValidPhones,
  minRevenue,
  maxRevenue,
  setMinRevenue,
  setMaxRevenue,
  respectOffices,
  setRespectOffices,
  handleDistribute,
  remainingStock,
  assigned,
  distributing,
  distributionResult,
  officeFilter,
}: {
  consultants: ConsultantWithOffice[];
  consultantsLoading: boolean;
  selectedDistributionConsultants: string[];
  setSelectedDistributionConsultants: (ids: string[]) => void;
  distributionQuantity: number;
  setDistributionQuantity: (value: number) => void;
  distributionMode: "PER_CONSULTANT" | "TOTAL";
  setDistributionMode: (mode: "PER_CONSULTANT" | "TOTAL") => void;
  totalQuantity: number;
  setTotalQuantity: (value: number) => void;
  onlyNewLeads: boolean;
  setOnlyNewLeads: (value: boolean) => void;
  selectedStatuses: LeadStatus[];
  setSelectedStatuses: Dispatch<SetStateAction<LeadStatus[]>>;
  onlyUnassigned: boolean;
  setOnlyUnassigned: (value: boolean) => void;
  onlyWithPhones: boolean;
  setOnlyWithPhones: (value: boolean) => void;
  onlyValidPhones: boolean;
  setOnlyValidPhones: (value: boolean) => void;
  minRevenue: string;
  maxRevenue: string;
  setMinRevenue: (v: string) => void;
  setMaxRevenue: (v: string) => void;
  respectOffices: boolean;
  setRespectOffices: (v: boolean) => void;
  handleDistribute: () => Promise<void>;
  remainingStock: number;
  assigned: number;
  distributing: boolean;
  distributionResult: {
    totalEligible: number;
    totalDistributed: number;
    perConsultant: { consultantId: string; name: string; email: string; distributed: number }[];
  } | null;
  officeFilter: string;
}) {
  return (
    <div className="rounded-2xl border bg-white/80 p-4 shadow-sm space-y-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-slate-900">Distribuição</h2>
        <p className="text-sm text-slate-600">
          Distribuição simples por consultor. A lógica avançada (modos adicionais, filtros e preview) fica para a Etapa 3.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="space-y-1 md:col-span-2">
          <label className="text-xs text-slate-600">Consultores</label>
          {consultantsLoading ? (
            <p className="text-xs text-slate-500">Carregando consultores…</p>
          ) : consultants.length === 0 ? (
            <p className="text-xs text-slate-500">
              {officeFilter
                ? "Nenhum consultor elegível para este escritório."
                : "Selecione um escritório e clique em Aplicar para carregar consultores."}
            </p>
          ) : (
            <>
              <select
                multiple
                value={selectedDistributionConsultants}
                onChange={(e) => setSelectedDistributionConsultants(Array.from(e.target.selectedOptions, (o) => o.value))}
                className="h-28 w-full rounded-lg border px-3 py-2 text-sm"
              >
                {consultants.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name ?? c.email} {c.officeName ? `(${c.officeName})` : ""}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500">Selecione um ou mais consultores habilitados para esta campanha.</p>
            </>
          )}
        </div>
        <div className="space-y-2">
          <label className="text-xs text-slate-600">Modo de distribuição</label>
          <select
            value={distributionMode}
            onChange={(e) => setDistributionMode(e.target.value as "PER_CONSULTANT" | "TOTAL")}
            className="w-full rounded-lg border px-3 py-2 text-sm"
          >
            <option value="PER_CONSULTANT">Quantidade por consultor</option>
            <option value="TOTAL">Quantidade total (rodízio)</option>
          </select>
          {distributionMode === "PER_CONSULTANT" ? (
            <div className="space-y-1">
              <label className="text-xs text-slate-600">Quantidade por consultor</label>
              <input
                type="number"
                min={1}
                value={distributionQuantity}
                onChange={(e) => setDistributionQuantity(Math.max(1, Number(e.target.value)))}
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
            </div>
          ) : (
            <div className="space-y-1">
              <label className="text-xs text-slate-600">Quantidade total</label>
              <input
                type="number"
                min={1}
                value={totalQuantity}
                onChange={(e) => setTotalQuantity(Math.max(1, Number(e.target.value)))}
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
            </div>
          )}
          <div className="flex items-center gap-2 pt-1">
            <input
              id="only-new"
              type="checkbox"
              checked={onlyNewLeads}
              onChange={(e) => setOnlyNewLeads(e.target.checked)}
            />
            <label htmlFor="only-new" className="text-xs text-slate-600">
              Apenas leads NOVOS (padrão)
            </label>
          </div>
          {!onlyNewLeads ? (
            <div className="space-y-1">
              <p className="text-xs text-slate-600">Status elegíveis</p>
              <div className="grid grid-cols-2 gap-1 text-xs text-slate-700">
                {Object.values(LeadStatus).map((status) => (
                  <label key={status} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={selectedStatuses.includes(status)}
                      onChange={(e) => {
                        setSelectedStatuses((prev) =>
                          e.target.checked ? [...prev, status] : prev.filter((s) => s !== status)
                        );
                      }}
                    />
                    {status}
                  </label>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        <div className="space-y-2">
          <label className="text-xs text-slate-600">Resumo</label>
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm text-slate-700 space-y-1">
            <p>Estoque: {remainingStock}</p>
            <p>Atribuídos: {assigned}</p>
          </div>
          <button
            onClick={handleDistribute}
            disabled={distributing}
            className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {distributing ? "Distribuindo..." : "Distribuir leads"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-xl border bg-white p-4 text-sm shadow-sm md:grid-cols-3">
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-700">Filtros</label>
          <div className="flex items-center gap-2">
            <input
              id="only-unassigned"
              type="checkbox"
              checked={onlyUnassigned}
              onChange={(e) => setOnlyUnassigned(e.target.checked)}
            />
            <label htmlFor="only-unassigned" className="text-xs text-slate-600">
              Apenas não atribuídos
            </label>
          </div>
          <div className="flex items-center gap-2">
            <input
              id="only-phone"
              type="checkbox"
              checked={onlyWithPhones}
              onChange={(e) => setOnlyWithPhones(e.target.checked)}
            />
            <label htmlFor="only-phone" className="text-xs text-slate-600">
              Apenas com telefone
            </label>
          </div>
          <div className="flex items-center gap-2">
            <input
              id="valid-phone"
              type="checkbox"
              checked={onlyValidPhones}
              onChange={(e) => setOnlyValidPhones(e.target.checked)}
            />
            <label htmlFor="valid-phone" className="text-xs text-slate-600">
              Ignorar telefones inválidos
            </label>
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-700">Faturamento</label>
          <div className="flex items-center gap-2">
            <input
              placeholder="Mínimo"
              type="number"
              value={minRevenue}
              onChange={(e) => setMinRevenue(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
            <input
              placeholder="Máximo"
              type="number"
              value={maxRevenue}
              onChange={(e) => setMaxRevenue(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
          </div>
          <p className="text-xs text-slate-500">Campos opcionais. Se vazio, não filtram.</p>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-700">Escritório</label>
          <div className="flex items-center gap-2">
            <input
              id="respect-offices"
              type="checkbox"
              checked={respectOffices}
              onChange={(e) => setRespectOffices(e.target.checked)}
            />
            <label htmlFor="respect-offices" className="text-xs text-slate-600">
              Distribuir considerando escritório (SAFE TI / JLC Tech)
            </label>
          </div>
          <p className="text-xs text-slate-500">
            Se desmarcar, distribui dentro do escopo permitido do usuário, mesmo com escritórios diferentes.
          </p>
          <p className="text-[11px] text-slate-400">
            TODO (Etapa 3/4): adicionar filtros de CNAE, cidade, UF, telefone válido e pré-visualização.
          </p>
        </div>
      </div>

      {distributionResult ? (
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">Resumo da última distribuição</h3>
          <p className="text-sm text-slate-600">
            Elegíveis: {distributionResult.totalEligible} • Distribuídos: {distributionResult.totalDistributed}
          </p>
          <ul className="mt-2 space-y-1 text-sm text-slate-700">
            {distributionResult.perConsultant.map((row) => (
              <li key={row.consultantId}>
                {row.name} ({row.email}): <span className="font-semibold">{row.distributed}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function RecaptureTab({
  leads,
  consultants,
  selectedConsultor,
  setSelectedConsultor,
}: {
  leads: LeadItem[];
  consultants: ConsultantWithOffice[];
  selectedConsultor: string;
  setSelectedConsultor: (id: string) => void;
}) {
  const eligible = useMemo(() => leads.filter((lead) => RECAPTURE_STATUSES.includes(lead.status)), [leads]);

  return (
    <div className="rounded-2xl border bg-white/80 p-4 shadow-sm space-y-3">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-slate-900">Repescagem</h2>
        <p className="text-sm text-slate-600">
          Direcione leads parados ou pouco trabalhados para outro consultor. Apenas MASTER, GERENTE_SENIOR, GERENTE_NEGOCIOS
          e PROPRIETARIO enxergam esta aba.
        </p>
        <p className="text-xs text-slate-500">
          TODO (Etapa 4): ligar filtros reais (última atividade, status, tempo parado) e chamar /api/campaigns/[id]/recapture.
        </p>
      </div>

      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <label className="text-xs text-slate-600">Consultor destino</label>
          <select
            value={selectedConsultor}
            onChange={(e) => setSelectedConsultor(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm md:w-72"
          >
            <option value="">Selecione</option>
            {consultants.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name ?? c.email}
              </option>
            ))}
          </select>
        </div>
        <button
          disabled
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-500"
        >
          Repescar selecionados (breve)
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b text-left text-slate-500">
              <th className="py-2 pr-3">Empresa</th>
              <th className="py-2 pr-3">Consultor atual</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 pr-3">Última atividade</th>
              <th className="py-2 pr-3">Selecionar</th>
            </tr>
          </thead>
          <tbody>
            {eligible.slice(0, 20).map((lead) => (
              <tr key={lead.id} className="border-b last:border-b-0">
                <td className="py-2 pr-3">{lead.razaoSocial ?? lead.nomeFantasia ?? "-"}</td>
                <td className="py-2 pr-3">{lead.consultor?.name ?? lead.consultor?.email ?? "-"}</td>
                <td className="py-2 pr-3">{lead.status}</td>
                <td className="py-2 pr-3">—</td>
                <td className="py-2 pr-3">
                  <input type="checkbox" disabled />
                </td>
              </tr>
            ))}
            {eligible.length === 0 ? (
              <tr>
                <td className="py-2 pr-3 text-sm text-slate-500" colSpan={5}>
                  Nenhum lead elegível listado. TODO (Etapa 4): carregar leads parados com filtros reais.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LeadFiltersForm({
  filters,
  setFilters,
  consultants,
}: {
  filters: LeadFilters;
  setFilters: Dispatch<SetStateAction<LeadFilters>>;
  consultants: ConsultantWithOffice[];
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-6">
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
      <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
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
      </div>
    </div>
  );
}

function ConfirmDeleteBatch({
  batch,
  onCancel,
  onConfirm,
}: {
  batch: CampaignBatch;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="w-full max-w-lg space-y-3 rounded-xl bg-white p-6 shadow-2xl">
        <h3 className="text-lg font-semibold text-slate-900">Excluir lote importado</h3>
        <p className="text-sm text-slate-600">
          Isso removerá todos os leads e atividades vinculados a este arquivo/importação. A ação é irreversível.
        </p>
        <p className="text-sm font-semibold text-slate-800">
          {batch.nomeArquivoOriginal} — {batch.totalLeads} leads
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-100"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500"
          >
            Excluir batch
          </button>
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
