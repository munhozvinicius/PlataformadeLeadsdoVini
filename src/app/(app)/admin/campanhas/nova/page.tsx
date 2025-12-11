"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";

type OfficeRecord = {
  id: string;
  name: string;
  code: string;
  office?: string | null;
  owner?: { id: string; name: string };
  businessManager?: { id: string; name: string };
  seniorManager?: { id: string; name: string };
};

const ALLOWED_ROLES = ["MASTER", "GERENTE_SENIOR", "GERENTE_NEGOCIOS", "PROPRIETARIO"];
const RESTRICTED_ROLES = ["GERENTE_NEGOCIOS", "PROPRIETARIO"];

export default function NovaCampanhaPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [office, setOffice] = useState("");
  const [type, setType] = useState<"COCKPIT" | "MAPA_PARQUE">("COCKPIT");
  const [offices, setOffices] = useState<OfficeRecord[]>([]);
  const [selectedOfficeId, setSelectedOfficeId] = useState("");
  const [preferredOfficeRecordId, setPreferredOfficeRecordId] = useState("");
  const [officeHierarchy, setOfficeHierarchy] = useState<{ owner?: string; gn?: string; gs?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [fetchingOffices, setFetchingOffices] = useState(false);

  const canCreateCampaign = Boolean(session?.user?.role && ALLOWED_ROLES.includes(session.user.role));
  const isRestrictedRole = Boolean(session?.user?.role && RESTRICTED_ROLES.includes(session.user.role));
  const canSelectOffice = Boolean(session?.user?.role && ["MASTER", "GERENTE_SENIOR"].includes(session.user.role));

  const selectedOfficeName = useMemo(() => {
    const match = offices.find((record) => record.id === selectedOfficeId);
    return match ? `${match.name} (${match.code})` : office;
  }, [office, offices, selectedOfficeId]);

  const applyOfficeSelection = useCallback((record: OfficeRecord) => {
    const officeValue = record.office || record.code || "";
    setOffice(officeValue);
    setSelectedOfficeId(record.id);
    setOfficeHierarchy({
      owner: record.owner?.name,
      gn: record.businessManager?.name,
      gs: record.seniorManager?.name,
    });
  }, []);

  const loadOffices = useCallback(async () => {
    setFetchingOffices(true);
    try {
      const res = await fetch("/api/admin/offices");
      if (!res.ok) return;
      const data = await res.json();
      if (!Array.isArray(data)) return;
      setOffices(data);
    } catch (error) {
      console.error("Erro carregando escritórios", error);
    } finally {
      setFetchingOffices(false);
    }
  }, []);

  const loadUserOffice = useCallback(async () => {
    if (!session?.user?.id) return;
    try {
      const res = await fetch(`/api/admin/users/${session.user.id}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.office) {
        setOffice(data.office);
      }
      if (data.officeRecord?.id) {
        setPreferredOfficeRecordId(data.officeRecord.id);
      }
    } catch (error) {
      console.error("Erro carregando dados do usuário", error);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated") {
      router.replace("/login");
      return;
    }
    if (status === "authenticated") {
      if (!canCreateCampaign) {
        router.replace("/admin/campanhas");
        return;
      }
      loadOffices();
      if (isRestrictedRole) {
        loadUserOffice();
      }
    }
  }, [canCreateCampaign, isRestrictedRole, loadOffices, loadUserOffice, router, status]);

  useEffect(() => {
    if (preferredOfficeRecordId && offices.length > 0) {
      const matched = offices.find((record) => record.id === preferredOfficeRecordId);
      if (matched) {
        applyOfficeSelection(matched);
        return;
      }
    }
    if (!selectedOfficeId && offices.length > 0) {
      applyOfficeSelection(offices[0]);
    }
  }, [applyOfficeSelection, offices, preferredOfficeRecordId, selectedOfficeId]);

  const handleOfficeChange = (officeId: string) => {
    const record = offices.find((item) => item.id === officeId);
    if (record) {
      applyOfficeSelection(record);
    }
  };

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!office) {
      setMessage("Selecione um escritório.");
      return;
    }
    if (!nome.trim()) {
      setMessage("Informe o nome da campanha.");
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      const res = await fetch("/api/campanhas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: nome.trim(),
          descricao: descricao.trim() || undefined,
          type,
          office,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage(data?.message ?? "Erro ao criar campanha.");
        return;
      }
      router.push(`/admin/campanhas/${data.id}`);
    } catch (error) {
      console.error("Erro ao criar campanha", error);
      setMessage("Erro ao criar campanha.");
    } finally {
      setLoading(false);
    }
  }

  if (status === "loading") {
    return <div className="text-center py-12">Carregando...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Nova Campanha</h1>
        <Link
          href="/admin/campanhas"
          className="text-sm text-slate-500 hover:text-slate-900"
        >
          Voltar
        </Link>
      </div>
      <div className="bg-white rounded-2xl border p-6 shadow-sm space-y-6">
        <p className="text-sm text-slate-500">
          Crie campanhas com base Cockpit ou Base Visão Parque e carregue a planilha diretamente.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Nome da campanha</label>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Retenção SP3 Q1"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-neon-pink focus:border-neon-pink outline-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Descrição (opcional)</label>
            <textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              rows={3}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-neon-pink focus:border-neon-pink outline-none"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Tipo de base</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as "COCKPIT" | "MAPA_PARQUE")}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              >
                <option value="COCKPIT">Cockpit (Leads)</option>
                <option value="MAPA_PARQUE">Base Visão Parque</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Escritório responsável</label>
              {canSelectOffice ? (
                <select
                  value={selectedOfficeId}
                  onChange={(event) => handleOfficeChange(event.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                >
                  {offices.map((officeRecord) => (
                    <option key={officeRecord.id} value={officeRecord.id}>
                      {officeRecord.name} ({officeRecord.office || officeRecord.code})
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={selectedOfficeName}
                  disabled
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-slate-100 text-slate-500"
                />
              )}
              {fetchingOffices && (
                <p className="text-xs text-slate-400">Carregando escritórios...</p>
              )}
              {isRestrictedRole && selectedOfficeId && (
                <p className="text-xs text-slate-500">
                  Você só pode criar campanhas para o escritório {selectedOfficeName}.
                </p>
              )}
            </div>
          </div>

          {officeHierarchy && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 space-y-1">
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Hierarquia vinculada</p>
              <div className="flex flex-wrap gap-3">
                <span className="px-3 py-1 bg-white rounded-full shadow-sm">Owner: {officeHierarchy.owner ?? "—"}</span>
                <span className="px-3 py-1 bg-white rounded-full shadow-sm">GN: {officeHierarchy.gn ?? "—"}</span>
                <span className="px-3 py-1 bg-white rounded-full shadow-sm">GS: {officeHierarchy.gs ?? "—"}</span>
              </div>
            </div>
          )}

          {message && (
            <div className="p-3 text-sm rounded-lg border border-red-200 bg-red-50 text-red-700">
              {message}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Link
              href="/admin/campanhas"
              className="px-5 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-500 hover:border-slate-300"
            >
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-5 py-2 rounded-lg bg-neon-green text-black font-black uppercase tracking-wide text-xs hover:bg-white hover:shadow-[0_0_20px_rgba(204,255,0,0.4)] disabled:opacity-50"
            >
              {loading ? "Criando..." : "Criar Campanha"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
