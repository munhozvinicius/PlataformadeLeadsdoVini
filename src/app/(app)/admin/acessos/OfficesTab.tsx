"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
// import { useRouter } from "next/navigation";
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
    seniorManagerId?: string | null;
    businessManagerId?: string | null;
    ownerId?: string | null;
    seniorManager?: { id: string; name: string | null; email: string | null } | null;
    businessManager?: { id: string; name: string | null; email: string | null } | null;
    owner?: { id: string; name: string | null; email: string | null } | null;
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
    seniorManagerId: string;
    businessManagerId: string;
    ownerId: string;
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

type UserOption = { id: string; name: string; email: string };

const emptyForm: OfficeFormState = {
    name: "",
    code: "",
    region: "",
    uf: "",
    city: "",
    notes: "",
    active: true,
    seniorManagerId: "",
    businessManagerId: "",
    ownerId: "",
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

export function OfficesTab() {
    // const router = useRouter();
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
    const [seniorManagers, setSeniorManagers] = useState<UserOption[]>([]);
    const [businessManagers, setBusinessManagers] = useState<UserOption[]>([]);
    const [owners, setOwners] = useState<UserOption[]>([]);


    // Removed redirect since this is now a tab component
    // useEffect(() => {
    //   if (status === "authenticated" && !canManageOffices(session?.user?.role)) {
    //     router.replace("/board");
    //   }
    // }, [status, session, router]);

    const canManage = session?.user?.role === Role.MASTER || session?.user?.role === Role.GERENTE_SENIOR || session?.user?.role === Role.GERENTE_NEGOCIOS;


    const fetchOffices = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const res = await fetch("/api/admin/offices", { cache: "no-store" });
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
        if (status === "authenticated" && canManage) {
            fetchOffices();
        }
    }, [status, session, canManage, fetchOffices]);

    const fetchHierarchyUsers = useCallback(async () => {
        try {
            const res = await fetch("/api/admin/users", { cache: "no-store" });
            if (!res.ok) return;
            const data = (await res.json()) as {
                id: string;
                name: string;
                email: string;
                role: Role;
            }[];
            setSeniorManagers(
                data
                    .filter((u) => u.role === Role.GERENTE_SENIOR)
                    .map((u) => ({ id: u.id, name: u.name, email: u.email }))
                    .sort((a, b) => a.name.localeCompare(b.name))
            );
            setBusinessManagers(
                data
                    .filter((u) => u.role === Role.GERENTE_NEGOCIOS)
                    .map((u) => ({ id: u.id, name: u.name, email: u.email }))
                    .sort((a, b) => a.name.localeCompare(b.name))
            );
            setOwners(
                data
                    .filter((u) => u.role === Role.PROPRIETARIO)
                    .map((u) => ({ id: u.id, name: u.name, email: u.email }))
                    .sort((a, b) => a.name.localeCompare(b.name))
            );
        } catch (err) {
            console.error("Erro ao carregar hierarquia de usuários", err);
        }
    }, []);

    useEffect(() => {
        if (status === "authenticated" && canManage) {
            fetchHierarchyUsers();
        }
    }, [status, session, canManage, fetchHierarchyUsers]);

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
            seniorManagerId: office.seniorManagerId ?? "",
            businessManagerId: office.businessManagerId ?? "",
            ownerId: office.ownerId ?? "",
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
                seniorManagerId: form.seniorManagerId || null,
                businessManagerId: form.businessManagerId || null,
                ownerId: form.ownerId || null,
            };
            const endpoint =
                modalMode === "create" ? "/api/admin/offices" : `/api/admin/offices/${encodeURIComponent(editingId ?? "")}`;
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

    const handleDeleteOffice = async () => {
        if (!editingId) return;
        const target = offices.find((office) => office.id === editingId);
        const confirmed = window.confirm(
            `Tem certeza que deseja excluir o escritório "${target?.name ?? "este escritório"}"?`
        );
        if (!confirmed) return;
        try {
            const res = await fetch(`/api/admin/offices/${encodeURIComponent(editingId)}`, {
                method: "DELETE",
            });
            if (!res.ok) {
                console.error(await res.text());
                alert("Erro ao excluir o escritório. Verifique se ele não tem usuários vinculados.");
                return;
            }
            await fetchOffices();
            closeModal();
        } catch (err) {
            console.error(err);
            alert("Erro inesperado ao excluir o escritório.");
        }
    };

    const openDetails = async (office: OfficeRecordDto) => {
        setDetailOpen(true);
        setDetailOffice(office);
        setDetailUsers(null);
        setDetailLoading(true);
        try {
            const [officeRes, usersRes] = await Promise.all([
                fetch(`/api/admin/offices/${office.id}`, { cache: "no-store" }),
                fetch(`/api/admin/offices/${office.id}/users`, { cache: "no-store" }), // Note: Ensure this endpoint exists or use logic to filter users
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
    if (!canManage) return null;

    return (
        <div className="max-w-6xl mx-auto space-y-6 text-white">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between bg-pic-dark border border-pic-zinc rounded-xl p-4 shadow-lg shadow-black/30">
                <div>
                    <p className="text-[10px] uppercase tracking-[0.3em] text-neon-pink">Gestão</p>
                    <h1 className="text-3xl font-bold text-white">Escritórios</h1>
                    <p className="text-sm text-slate-400">Hierarquia GS → GN → Proprietário → Consultor.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        onClick={fetchOffices}
                        className="rounded-lg border border-slate-700 bg-black/60 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-neon-blue hover:text-white transition-colors"
                    >
                        Atualizar
                    </button>
                    <button
                        onClick={openCreateModal}
                        className="rounded-lg bg-neon-blue px-4 py-2 text-sm font-bold text-black shadow-lg shadow-neon-blue/30 hover:scale-[1.01] transition-transform"
                    >
                        Novo escritório
                    </button>
                </div>
            </div>

            <div className="rounded-xl border border-pic-zinc bg-pic-dark shadow-lg shadow-black/30">
                <div className="flex items-center justify-between px-4 pt-4">
                    <h2 className="text-lg font-semibold text-white">Escritórios cadastrados</h2>
                </div>
                {error ? <p className="mb-3 text-sm text-red-400 px-4">{error}</p> : null}
                {loading ? (
                    <p className="text-sm text-slate-400 px-4 pb-4">Carregando escritórios...</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead>
                                <tr className="bg-black/50 text-left text-slate-300 uppercase tracking-[0.15em] text-[11px]">
                                    <th className="px-3 py-3 font-semibold">Nome</th>
                                    <th className="px-3 py-3 font-semibold">Código</th>
                                    <th className="px-3 py-3 font-semibold">UF</th>
                                    <th className="px-3 py-3 font-semibold">Cidade</th>
                                    <th className="px-3 py-3 font-semibold">Ativo</th>
                                    <th className="px-3 py-3 font-semibold">Ger. Sênior</th>
                                    <th className="px-3 py-3 font-semibold">Ger. Negócios</th>
                                    <th className="px-3 py-3 font-semibold">Proprietário</th>
                                    <th className="px-3 py-3 font-semibold">Proprietários</th>
                                    <th className="px-3 py-3 font-semibold">Consultores</th>
                                    <th className="px-3 py-3 font-semibold">Total usuários</th>
                                    <th className="px-3 py-3 font-semibold">Criado em</th>
                                    <th className="px-3 py-3 font-semibold text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {tableRows.map((office) => (
                                    <tr key={office.id} className="border-b border-pic-zinc/60 last:border-b-0 hover:bg-white/5 transition-colors">
                                        <td className="px-3 py-3 font-semibold text-white">{office.name}</td>
                                        <td className="px-3 py-3 text-slate-300 font-mono">{office.code}</td>
                                        <td className="px-3 py-3 text-slate-400">{office.uf ?? "-"}</td>
                                        <td className="px-3 py-3 text-slate-400">{office.city ?? "-"}</td>
                                        <td className="px-3 py-2">
                                            <Badge active={office.active} />
                                        </td>
                                        <td className="px-3 py-3 text-slate-300">{office.seniorManager?.name ?? "-"}</td>
                                        <td className="px-3 py-3 text-slate-300">{office.businessManager?.name ?? "-"}</td>
                                        <td className="px-3 py-3 text-slate-300">{office.owner?.name ?? "-"}</td>
                                        <td className="px-3 py-3 text-slate-300">{office.totalProprietarios ?? 0}</td>
                                        <td className="px-3 py-3 text-slate-300">{office.totalConsultores ?? 0}</td>
                                        <td className="px-3 py-3 text-slate-300">{office.totalUsers ?? 0}</td>
                                        <td className="px-3 py-3 text-slate-400">{office.createdLabel}</td>
                                        <td className="px-3 py-3 text-right">
                                            <div className="flex flex-wrap gap-2 text-sm justify-end">
                                                <button
                                                    onClick={() => openDetails(office)}
                                                    className="rounded-lg border border-slate-700 px-3 py-1 font-semibold text-slate-200 hover:border-neon-blue hover:text-white transition-colors"
                                                >
                                                    Detalhes
                                                </button>
                                                <button
                                                    onClick={() => openEditModal(office)}
                                                    className="rounded-lg bg-neon-blue px-3 py-1 font-semibold text-black hover:scale-[1.02] transition-transform shadow-sm shadow-neon-blue/30"
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
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4" onMouseDown={closeModal}>
                    <div
                        className="w-full max-w-3xl rounded-xl bg-pic-dark border border-pic-zinc p-6 shadow-[0_10px_50px_rgba(0,0,0,0.6)]"
                        onMouseDown={(event) => event.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <p className="text-[10px] uppercase tracking-[0.25em] text-neon-pink">Escritório</p>
                                <h3 className="text-2xl font-bold text-white">
                                    {modalMode === "create" ? "Novo escritório" : "Editar escritório"}
                                </h3>
                            </div>
                            <button className="text-slate-400 hover:text-white" onClick={closeModal}>
                                Fechar
                            </button>
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <label className="text-xs text-slate-400">Nome *</label>
                                <input
                                    value={form.name}
                                    onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                                    className="w-full rounded-lg border border-slate-700 bg-black px-3 py-2 text-sm text-white"
                                    placeholder="Ex: Safe TI"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs text-slate-400">Código</label>
                                <input
                                    value={form.code}
                                    onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))}
                                    className="w-full rounded-lg border border-slate-700 bg-black px-3 py-2 text-sm text-white"
                                    placeholder="Ex: SAFE_TI"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs text-slate-400">Região</label>
                                <input
                                    value={form.region}
                                    onChange={(e) => setForm((prev) => ({ ...prev, region: e.target.value }))}
                                    className="w-full rounded-lg border border-slate-700 bg-black px-3 py-2 text-sm text-white"
                                    placeholder="Ex: Interior"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs text-slate-400">UF</label>
                                <input
                                    value={form.uf}
                                    onChange={(e) => setForm((prev) => ({ ...prev, uf: e.target.value.toUpperCase() }))}
                                    className="w-full rounded-lg border border-slate-700 bg-black px-3 py-2 text-sm text-white"
                                    placeholder="SP"
                                    maxLength={2}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs text-slate-400">Cidade</label>
                                <input
                                    value={form.city}
                                    onChange={(e) => setForm((prev) => ({ ...prev, city: e.target.value }))}
                                    className="w-full rounded-lg border border-slate-700 bg-black px-3 py-2 text-sm text-white"
                                    placeholder="Ribeirão Preto"
                                />
                            </div>
                            <div className="flex items-center gap-2 pt-6">
                                <input
                                    id="active"
                                    type="checkbox"
                                    checked={form.active}
                                    onChange={(e) => setForm((prev) => ({ ...prev, active: e.target.checked }))}
                                    className="h-4 w-4 rounded border-slate-600 text-neon-blue focus:ring-neon-blue"
                                />
                                <label htmlFor="active" className="text-sm text-slate-200">
                                    Ativo
                                </label>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 mt-6">
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Gerente Sênior</label>
                                <select
                                    value={form.seniorManagerId}
                                    onChange={(e) => setForm((prev) => ({ ...prev, seniorManagerId: e.target.value }))}
                                    className="h-10 rounded-lg border border-slate-700 bg-black px-3 text-sm outline-none text-white focus:border-neon-blue focus:ring-2 focus:ring-neon-blue/30"
                                >
                                    <option value="">Nenhum</option>
                                    {seniorManagers.map((user) => (
                                        <option key={user.id} value={user.id}>
                                            {user.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Gerente de Negócios</label>
                                <select
                                    value={form.businessManagerId}
                                    onChange={(e) => setForm((prev) => ({ ...prev, businessManagerId: e.target.value }))}
                                    className="h-10 rounded-lg border border-slate-700 bg-black px-3 text-sm outline-none text-white focus:border-neon-blue focus:ring-2 focus:ring-neon-blue/30"
                                >
                                    <option value="">Nenhum</option>
                                    {businessManagers.map((user) => (
                                        <option key={user.id} value={user.id}>
                                            {user.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Proprietário</label>
                                <select
                                    value={form.ownerId}
                                    onChange={(e) => setForm((prev) => ({ ...prev, ownerId: e.target.value }))}
                                    className="h-10 rounded-lg border border-slate-700 bg-black px-3 text-sm outline-none text-white focus:border-neon-blue focus:ring-2 focus:ring-neon-blue/30"
                                >
                                    <option value="">Nenhum</option>
                                    {owners.map((user) => (
                                        <option key={user.id} value={user.id}>
                                            {user.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="mt-4 space-y-2">
                            <label className="text-xs text-slate-400">Observações</label>
                            <textarea
                                value={form.notes}
                                onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                                className="w-full rounded-lg border border-slate-700 bg-black px-3 py-2 text-sm text-white"
                                rows={3}
                            />
                        </div>
                        {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
                        <div className="mt-6 flex items-center justify-end gap-3">
                            {modalMode === "edit" && editingId ? (
                                <button
                                    type="button"
                                    onClick={handleDeleteOffice}
                                    className="mr-auto rounded-full border border-red-500/50 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-900/20"
                                >
                                    Excluir escritório
                                </button>
                            ) : null}
                            <button
                                onClick={closeModal}
                                className="rounded-lg border border-slate-700 bg-black px-4 py-2 text-sm font-semibold text-slate-200 hover:border-neon-blue"
                                type="button"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={submitOffice}
                                disabled={submitting}
                                className="rounded-lg bg-neon-blue px-4 py-2 text-sm font-bold text-black hover:scale-[1.02] transition-transform disabled:opacity-50"
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
                                            <span>Gerente Sênior</span>
                                            <span className="font-semibold text-slate-900">
                                                {detailOffice.seniorManager?.name ?? detailOffice.seniorManagerId ?? "-"}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span>Gerente de Negócios</span>
                                            <span className="font-semibold text-slate-900">
                                                {detailOffice.businessManager?.name ?? detailOffice.businessManagerId ?? "-"}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span>Proprietário</span>
                                            <span className="font-semibold text-slate-900">
                                                {detailOffice.owner?.name ?? detailOffice.ownerId ?? "-"}
                                            </span>
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
                                <button
                                    type="button"
                                    onClick={() => {
                                        closeDetails();
                                        openEditModal(detailOffice);
                                    }}
                                    className="mt-4 inline-flex items-center gap-2 rounded-full border border-purple-200 px-4 py-2 text-xs font-semibold text-purple-700 hover:bg-purple-50"
                                >
                                    Editar hierarquia (GS / GN / Proprietário)
                                </button>
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
