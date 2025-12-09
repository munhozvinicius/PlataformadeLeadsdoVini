"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { Office, Role } from "@prisma/client";
import UserDrawer, { DrawerMode, OwnerOption, UserDrawerPayload } from "../users/UserDrawer";
import { canManageUsers } from "@/lib/authRoles";
import { Plus } from "lucide-react";

type AdminUser = {
    id: string;
    name: string;
    email: string;
    role: Role;
    office: Office;
    officeRecord?: { id: string; name: string; code: string } | null;
    owner?: { id: string; name: string; email: string } | null;
    offices: { office: Office }[];
    active: boolean;
};

type OfficeRecordDto = {
    id: string;
    code: string;
    name: string;
    active: boolean;
    createdAt: string;
};

const profileLabels: Record<Role, string> = {
    MASTER: "Master",
    GERENTE_SENIOR: "Gerente Sênior",
    GERENTE_NEGOCIOS: "Gerente de Negócios",
    PROPRIETARIO: "Proprietário",
    CONSULTOR: "Consultor",
};

// Updated Neon Palette
const profileColors: Record<Role, string> = {
    MASTER: "bg-purple-900/20 text-purple-400 ring-purple-500/50 shadow-[0_0_10px_rgba(168,85,247,0.2)]",
    GERENTE_SENIOR: "bg-blue-900/20 text-blue-400 ring-blue-500/50 shadow-[0_0_10px_rgba(59,130,246,0.2)]",
    GERENTE_NEGOCIOS: "bg-cyan-900/20 text-cyan-400 ring-cyan-500/50 shadow-[0_0_10px_rgba(6,182,212,0.2)]",
    PROPRIETARIO: "bg-amber-900/20 text-amber-400 ring-amber-500/50 shadow-[0_0_10px_rgba(245,158,11,0.2)]",
    CONSULTOR: "bg-emerald-900/20 text-emerald-400 ring-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.2)]",
};

export function UsersTab() {
    const { data: session, status } = useSession();
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [offices, setOffices] = useState<OfficeRecordDto[]>([]);
    const [usersLoading, setUsersLoading] = useState(true);
    const [usersError, setUsersError] = useState("");
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [drawerMode, setDrawerMode] = useState<DrawerMode>("create");
    const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
    const [drawerSubmitting, setDrawerSubmitting] = useState(false);
    const [profileFilter, setProfileFilter] = useState<Role | "ALL">("ALL");

    const loadUsers = useCallback(async () => {
        setUsersLoading(true);
        setUsersError("");
        try {
            const res = await fetch("/api/admin/users", { cache: "no-store" });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body?.message ?? "Não foi possível carregar os usuários.");
            }
            const data: AdminUser[] = await res.json();
            setUsers(data);
        } catch (err) {
            console.error(err);
            setUsers([]);
            setUsersError((err as Error)?.message ?? "Erro ao carregar usuários.");
        } finally {
            setUsersLoading(false);
        }
    }, []);

    const loadOffices = useCallback(async () => {
        try {
            const res = await fetch("/api/offices", { cache: "no-store" });
            if (!res.ok) {
                throw new Error("Não foi possível carregar os escritórios.");
            }
            const data: OfficeRecordDto[] = await res.json();
            setOffices(data);
        } catch (err) {
            console.error(err);
            setOffices([]);
        }
    }, []);

    useEffect(() => {
        if (status === "authenticated" && canManageUsers(session?.user.role)) {
            loadUsers();
            loadOffices();
        }
    }, [status, session?.user.role, loadUsers, loadOffices]);

    const ownerOptions: OwnerOption[] = useMemo(
        () =>
            users
                .filter((user) => user.role === Role.PROPRIETARIO)
                .map((owner) => ({
                    id: owner.id,
                    name: owner.name,
                    email: owner.email,
                    officeRecordId: owner.officeRecord?.id ?? null,
                })),
        [users]
    );

    const activeOffices = useMemo(
        () => [...offices].filter((office) => office.active).sort((a, b) => a.name.localeCompare(b.name)),
        [offices]
    );

    const filteredUsers = useMemo(() => {
        if (profileFilter === "ALL") return users;
        return users.filter((user) => user.role === profileFilter);
    }, [users, profileFilter]);

    const openCreateDrawer = () => {
        setDrawerMode("create");
        setSelectedUser(null);
        setDrawerOpen(true);
    };

    const openEditDrawer = (user: AdminUser) => {
        setDrawerMode("edit");
        setSelectedUser(user);
        setDrawerOpen(true);
    };

    const closeDrawer = () => {
        setDrawerOpen(false);
        setSelectedUser(null);
    };

    const handleDrawerSubmit = useCallback(
        async (payload: UserDrawerPayload) => {
            setDrawerSubmitting(true);
            try {
                const endpoint = drawerMode === "create" ? "/api/admin/users" : `/api/admin/users/${selectedUser?.id}`;
                const res = await fetch(endpoint, {
                    method: drawerMode === "create" ? "POST" : "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
                if (!res.ok) {
                    const body = await res.json().catch(() => ({}));
                    throw new Error(body?.message ?? "Não foi possível salvar o usuário.");
                }
                await loadUsers();
            } finally {
                setDrawerSubmitting(false);
            }
        },
        [drawerMode, loadUsers, selectedUser?.id]
    );

    const handleResetPassword = useCallback(async (): Promise<string> => {
        if (!selectedUser) throw new Error("Usuário não selecionado");
        const newPassword = Math.random().toString(36).slice(-8);
        const res = await fetch(`/api/admin/users/${selectedUser.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: newPassword }),
        });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body?.message ?? "Não foi possível resetar a senha.");
        }
        return newPassword;
    }, [selectedUser]);

    const currentSessionUser = users.find((user) => user.id === session?.user.id);
    const canViewUsers = canManageUsers(session?.user.role);

    if (status === "loading") return null;
    if (!canViewUsers) {
        return (
            <div className="p-8 text-center bg-pic-dark border border-pic-zinc rounded-xl">
                <p className="text-slate-400">Você não tem permissão para gerenciar usuários.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Controls */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-pic-dark p-4 rounded-xl border border-pic-zinc shadow-sm">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Filtrar por:</span>
                    <select
                        value={profileFilter}
                        onChange={(e) => setProfileFilter(e.target.value as Role | "ALL")}
                        className="rounded-lg border border-slate-700 bg-black px-3 py-1.5 text-sm text-white focus:outline-none focus:border-neon-blue transition-colors uppercase tracking-wide font-medium"
                    >
                        <option value="ALL">Todos os perfis</option>
                        <option value={Role.MASTER}>Master</option>
                        <option value={Role.GERENTE_SENIOR}>Gerente Sênior</option>
                        <option value={Role.GERENTE_NEGOCIOS}>Gerente de Negócios</option>
                        <option value={Role.PROPRIETARIO}>Proprietário</option>
                        <option value={Role.CONSULTOR}>Consultor</option>
                    </select>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={loadUsers}
                        className="text-xs font-bold text-slate-500 hover:text-white uppercase tracking-wider transition-colors mr-2"
                    >
                        Atualizar Lista
                    </button>
                    <button
                        onClick={openCreateDrawer}
                        className="flex items-center gap-2 rounded-lg bg-neon-green px-4 py-2 text-xs font-bold text-slate-900 shadow-lg shadow-neon-green/20 hover:bg-emerald-400 hover:scale-105 transition-all"
                    >
                        <Plus className="w-4 h-4" />
                        NOVO USUÁRIO
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="rounded-xl border border-pic-zinc bg-pic-dark shadow-sm overflow-hidden">
                {usersLoading ? (
                    <div className="p-12 text-center">
                        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite] text-neon-blue" role="status"></div>
                        <p className="mt-4 text-sm text-slate-400 font-medium uppercase tracking-wider">Carregando equipe...</p>
                    </div>
                ) : usersError ? (
                    <div className="p-8 text-center">
                        <p className="text-red-500 mb-2 font-bold uppercase tracking-wider">Erro ao carregar</p>
                        <p className="text-sm text-slate-500">{usersError}</p>
                        <button onClick={loadUsers} className="mt-4 text-xs font-bold text-white underline hover:text-neon-blue">Tentar novamente</button>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead>
                                <tr className="bg-black/40 border-b border-pic-zinc text-left text-xs font-bold text-slate-500 uppercase tracking-widest">
                                    <th className="px-6 py-4">Usuário</th>
                                    <th className="px-6 py-4">Perfil</th>
                                    <th className="px-6 py-4">Escritório</th>
                                    <th className="px-6 py-4">Responsável (Owner)</th>
                                    <th className="px-6 py-4">Status</th>
                                    <th className="px-6 py-4 text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-pic-zinc">
                                {filteredUsers.map((user) => (
                                    <tr key={user.id} className="hover:bg-slate-800/50 transition-colors group">
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="font-bold text-white text-base">{user.name}</span>
                                                <span className="text-slate-500 text-xs">{user.email}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span
                                                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] uppercase tracking-wider font-bold ring-1 ring-inset ${profileColors[user.role]}`}
                                            >
                                                {profileLabels[user.role]}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-slate-300">
                                            {user.officeRecord ? (
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-white">{user.officeRecord.name}</span>
                                                    <span className="text-xs font-mono text-slate-500">{user.officeRecord.code}</span>
                                                </div>
                                            ) : (
                                                <span className="text-slate-600 italic">Global / Nenhum</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-slate-300">
                                            {user.owner ? (
                                                <div className="flex flex-col">
                                                    <span className="text-white font-bold">{user.owner.name}</span>
                                                </div>
                                            ) : (
                                                <span className="text-slate-600">-</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center">
                                                <span className={`inline-flex h-2 w-2 rounded-full mr-2 ${user.active ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-red-500'}`}></span>
                                                <span className={`text-xs font-bold uppercase tracking-wider ${user.active ? 'text-emerald-500' : 'text-slate-600'}`}>
                                                    {user.active ? "Ativo" : "Bloqueado"}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button
                                                onClick={() => openEditDrawer(user)}
                                                className="opacity-0 group-hover:opacity-100 transition-opacity rounded-lg border border-slate-700 px-4 py-2 text-xs font-bold text-slate-400 hover:bg-neon-blue hover:text-black hover:border-neon-blue active:scale-95 uppercase tracking-wider"
                                            >
                                                Gerenciar
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {!filteredUsers.length && (
                                    <tr>
                                        <td className="px-6 py-12 text-center text-slate-500 font-medium uppercase tracking-wider" colSpan={6}>
                                            Nenhum usuário encontrado com os filtros atuais.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <UserDrawer
                open={drawerOpen}
                mode={drawerMode}
                user={selectedUser ?? undefined}
                offices={activeOffices}
                owners={ownerOptions}
                isSubmitting={drawerSubmitting}
                onClose={closeDrawer}
                onSubmit={handleDrawerSubmit}
                onResetPassword={handleResetPassword}
                currentUserRole={session?.user.role}
                currentUserId={session?.user.id}
                currentUserOfficeRecordId={currentSessionUser?.officeRecord?.id ?? null}
            />
        </div>
    );
}
