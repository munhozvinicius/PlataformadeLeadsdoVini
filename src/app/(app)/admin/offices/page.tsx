"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Role } from "@prisma/client";

type OfficeRecordDto = {
  id: string;
  name: string;
  code: string;
  region: string | null;
  uf: string | null;
  city: string | null;
  notes: string | null;
  active: boolean;
  createdAt: string;
  totalUsers: number;
  totalProprietarios: number;
  totalConsultores: number;
};

type OfficeFormState = {
  name: string;
  code: string;
  region: string;
  uf: string;
  city: string;
  notes: string;
  active: boolean;
};

type OfficeUsersPayload = {
  proprietarios: { id: string; name: string | null; email: string | null }[];
  consultores: {
    id: string;
    name: string | null;
    email: string | null;
    owner?: { id: string; name: string | null; email: string | null } | null;
  }[];
};

const emptyForm: OfficeFormState = {
  name: "",
  code: "",
  region: "",
  uf: "",
  city: "",
  notes: "",
  active: true,
};

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(value));
  } catch {
    return value;
  }
}

function Badge({ active }: { active: boolean }) {
  return active ? (
    <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
      Ativo
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
      Inativo
    </span>
  );
}

export default function OfficesPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [offices, setOffices] = useState<OfficeRecordDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [form, setForm] = useState<OfficeFormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailOffice, setDetailOffice] = useState<OfficeRecordDto | null>(null);
  const [detailUsers, setDetailUsers] = useState<OfficeUsersPayload | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    if (status === "authenticated" && session?.user?.role !== Role.MASTER) {
      router.replace("/board");
    }
  }, [status, session, router]);

  const fetchOffices = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/offices", { cache: "no-store" });
      if (!res.ok) {
        throw new Error("Não foi possível carregar os escritórios.");
      }
      const data: OfficeRecordDto[] = await res.json();
      setOffices(data);
    } catch (err) {
      console.error(err);
      setError((err as Error)?.message ?? "Erro ao carregar escritórios.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated" && session?.user?.role === Role.MASTER) {
      fetchOffices();
    }
  }, [status, session, fetchOffices]);

  const openCreateModal = () => {
    setModalMode("create");
    setForm({ ...emptyForm });
    setEditingId(null);
    setModalOpen(true);
  };

  const openEditModal = (office: OfficeRecordDto) => {
    setModalMode("edit");
    setEditingId(office.id);
    setForm({
      name: office.name,
      code: office.code,
      region: office.region ?? "",
      uf: office.uf ?? "",
      city: office.city ?? "",
      notes: office.notes ?? "",
      active: office.active,
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
    setForm({ ...emptyForm });
  };

  const submitOffice = async () => {
    if (!form.name.trim()) {
      setError("Nome é obrigatório.");
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        name: form.name.trim(),
        code: form.code.trim(),
        region: form.region.trim(),
        uf: form.uf.trim(),
        city: form.city.trim(),
        notes: form.notes.trim(),
        active: form.active,
      };
      const endpoint =
        modalMode === "create" ? "/api/offices" : `/api/offices/${encodeURIComponent(editingId ?? "")}`;
      const method = modalMode === "create" ? "POST" : "PATCH";
      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? "Não foi possível salvar o escritório.");
      }
      await fetchOffices();
      closeModal();
    } catch (err) {
      console.error(err);
      setError((err as Error)?.message ?? "Erro ao salvar escritório.");
    } finally {
      setSubmitting(false);
    }
  };

  const openDetails = async (office: OfficeRecordDto) => {
    setDetailOpen(true);
    setDetailOffice(office);
    setDetailUsers(null);
    setDetailLoading(true);
    try {
      const [officeRes, usersRes] = await Promise.all([
        fetch(`/api/offices/${office.id}`, { cache: "no-store" }),
        fetch(`/api/offices/${office.id}/users`, { cache: "no-store" }),
      ]);
      if (officeRes.ok) {
        const updated: OfficeRecordDto = await officeRes.json();
        setDetailOffice(updated);
      }
      if (usersRes.ok) {
        const users: OfficeUsersPayload = await usersRes.json();
        setDetailUsers(users);
      }
    } catch (err) {
      console.error("Erro ao carregar detalhes do escritório", err);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetails = () => {
    setDetailOpen(false);
    setDetailOffice(null);
    setDetailUsers(null);
    setDetailLoading(false);
  };

  const tableRows = useMemo(
    () =>
      offices.map((office) => ({
        ...office,
        createdLabel: formatDate(office.createdAt),
      })),
    [offices]
  );

  if (status === "loading") return null;
  if (session?.user?.role !== Role.MASTER) return null;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Master</p>
          <h1 className="text-3xl font-semibold text-slate-900">Escritórios</h1>
          <p className="text-sm text-slate-500">
            Gerencie escritórios (PV, Safe TI, JLC Tech etc.) e veja a hierarquia de proprietários e consultores vinculados.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={fetchOffices}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100"
          >
            Atualizar
          </button>
          <button
            onClick={openCreateModal}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Novo escritório
          </button>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-slate-900">Escritórios cadastrados</h2>
        </div>
        {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
        {loading ? (
          <p className="text-sm text-slate-500">Carregando escritórios...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-slate-600">
                  <th className="px-3 py-2 font-semibold">Nome</th>
                  <th className="px-3 py-2 font-semibold">Código</th>
                  <th className="px-3 py-2 font-semibold">UF</th>
                  <th className="px-3 py-2 font-semibold">Cidade</th>
                  <th className="px-3 py-2 font-semibold">Ativo</th>
                  <th className="px-3 py-2 font-semibold">Proprietários</th>
                  <th className="px-3 py-2 font-semibold">Consultores</th>
                  <th className="px-3 py-2 font-semibold">Total usuários</th>
                  <th className="px-3 py-2 font-semibold">Criado em</th>
                  <th className="px-3 py-2 font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((office) => (
                  <tr key={office.id} className="border-b last:border-b-0">
                    <td className="px-3 py-2 font-medium text-slate-900">{office.name}</td>
                    <td className="px-3 py-2 text-slate-600">{office.code}</td>
                    <td className="px-3 py-2 text-slate-600">{office.uf ?? "-"}</td>
                    <td className="px-3 py-2 text-slate-600">{office.city ?? "-"}</td>
                    <td className="px-3 py-2">
                      <Badge active={office.active} />
                    </td>
                    <td className="px-3 py-2 text-slate-600">{office.totalProprietarios}</td>
                    <td className="px-3 py-2 text-slate-600">{office.totalConsultores}</td>
                    <td className="px-3 py-2 text-slate-600">{office.totalUsers}</td>
                    <td className="px-3 py-2 text-slate-600">{office.createdLabel}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2 text-sm">
                        <button
                          onClick={() => openDetails(office)}
                          className="rounded-lg border border-slate-200 px-3 py-1 font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Detalhes
                        </button>
                        <button
                          onClick={() => openEditModal(office)}
                          className="rounded-lg bg-slate-900 px-3 py-1 font-semibold text-white hover:bg-slate-800"
                        >
                          Editar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4" onMouseDown={closeModal}>
          <div
            className="w-full max-w-3xl rounded-xl bg-white p-6 shadow-xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Escritório</p>
                <h3 className="text-xl font-semibold text-slate-900">
                  {modalMode === "create" ? "Novo escritório" : "Editar escritório"}
                </h3>
              </div>
              <button className="text-slate-500 hover:text-slate-900" onClick={closeModal}>
                Fechar
              </button>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs text-slate-600">Nome *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  placeholder="Ex: Safe TI"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-slate-600">Código</label>
                <input
                  value={form.code}
                  onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  placeholder="Ex: SAFE_TI"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-slate-600">Região</label>
                <input
                  value={form.region}
                  onChange={(e) => setForm((prev) => ({ ...prev, region: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  placeholder="Ex: Interior"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-slate-600">UF</label>
                <input
                  value={form.uf}
                  onChange={(e) => setForm((prev) => ({ ...prev, uf: e.target.value.toUpperCase() }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  placeholder="SP"
                  maxLength={2}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-slate-600">Cidade</label>
                <input
                  value={form.city}
                  onChange={(e) => setForm((prev) => ({ ...prev, city: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  placeholder="Ribeirão Preto"
                />
              </div>
              <div className="flex items-center gap-2 pt-6">
                <input
                  id="active"
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm((prev) => ({ ...prev, active: e.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                />
                <label htmlFor="active" className="text-sm text-slate-700">
                  Ativo
                </label>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              <label className="text-xs text-slate-600">Observações</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                rows={3}
              />
            </div>
            {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={closeModal}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                type="button"
              >
                Cancelar
              </button>
              <button
                onClick={submitOffice}
                disabled={submitting}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                type="button"
              >
                {submitting ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {detailOpen && detailOffice && (
        <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/40" onMouseDown={closeDetails}>
          <div
            className="h-full w-full max-w-3xl bg-white p-6 shadow-2xl overflow-y-auto"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Escritório</p>
                <h3 className="text-2xl font-semibold text-slate-900">{detailOffice.name}</h3>
                <p className="text-sm text-slate-600">
                  {detailOffice.code} • {detailOffice.uf ?? "--"}/{detailOffice.city ?? "--"}
                </p>
              </div>
              <button className="text-slate-500 hover:text-slate-900" onClick={closeDetails}>
                Fechar
              </button>
            </div>

            <div className="mt-6 space-y-6">
              <div className="rounded-xl border bg-slate-50 p-4">
                <h4 className="text-sm font-semibold text-slate-900 mb-3">Resumo</h4>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1 text-sm text-slate-700">
                    <div className="flex items-center justify-between">
                      <span>Ativo</span>
                      <Badge active={detailOffice.active} />
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Região</span>
                      <span className="font-semibold text-slate-900">{detailOffice.region ?? "-"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>UF</span>
                      <span className="font-semibold text-slate-900">{detailOffice.uf ?? "-"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Cidade</span>
                      <span className="font-semibold text-slate-900">{detailOffice.city ?? "-"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Criado em</span>
                      <span className="font-semibold text-slate-900">{formatDate(detailOffice.createdAt)}</span>
                    </div>
                  </div>
                  <div className="space-y-2 text-sm text-slate-700">
                    <div className="flex items-center justify-between">
                      <span>Total usuários</span>
                      <span className="font-semibold text-slate-900">{detailOffice.totalUsers}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Proprietários</span>
                      <span className="font-semibold text-slate-900">{detailOffice.totalProprietarios}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Consultores</span>
                      <span className="font-semibold text-slate-900">{detailOffice.totalConsultores}</span>
                    </div>
                    {detailOffice.notes ? (
                      <div className="rounded-lg bg-white p-3 text-slate-700 border border-slate-200">
                        <p className="text-xs uppercase tracking-[0.1em] text-slate-500">Observações</p>
                        <p className="text-sm">{detailOffice.notes}</p>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-lg font-semibold text-slate-900">Proprietários</h4>
                  <Link href="/admin/users" className="text-sm font-semibold text-slate-700 hover:text-slate-900">
                    Ver usuários
                  </Link>
                </div>
                {detailLoading ? (
                  <p className="text-sm text-slate-500">Carregando...</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 text-left text-slate-600">
                          <th className="px-3 py-2 font-semibold">Nome</th>
                          <th className="px-3 py-2 font-semibold">Email</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailUsers?.proprietarios?.length ? (
                          detailUsers.proprietarios.map((user) => (
                            <tr key={user.id} className="border-b last:border-b-0">
                              <td className="px-3 py-2 font-medium text-slate-900">{user.name ?? "-"}</td>
                              <td className="px-3 py-2 text-slate-600">{user.email ?? "-"}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td className="px-3 py-2 text-sm text-slate-500" colSpan={2}>
                              Nenhum proprietário vinculado.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="rounded-xl border bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-lg font-semibold text-slate-900">Consultores</h4>
                  <Link href="/admin/users" className="text-sm font-semibold text-slate-700 hover:text-slate-900">
                    Ver usuários
                  </Link>
                </div>
                {detailLoading ? (
                  <p className="text-sm text-slate-500">Carregando...</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 text-left text-slate-600">
                          <th className="px-3 py-2 font-semibold">Nome</th>
                          <th className="px-3 py-2 font-semibold">Email</th>
                          <th className="px-3 py-2 font-semibold">Owner</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailUsers?.consultores?.length ? (
                          detailUsers.consultores.map((user) => (
                            <tr key={user.id} className="border-b last:border-b-0">
                              <td className="px-3 py-2 font-medium text-slate-900">{user.name ?? "-"}</td>
                              <td className="px-3 py-2 text-slate-600">{user.email ?? "-"}</td>
                              <td className="px-3 py-2 text-slate-600">
                                {user.owner ? `${user.owner.name ?? "-"} (${user.owner.email ?? "-"})` : "-"}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td className="px-3 py-2 text-sm text-slate-500" colSpan={3}>
                              Nenhum consultor vinculado.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
