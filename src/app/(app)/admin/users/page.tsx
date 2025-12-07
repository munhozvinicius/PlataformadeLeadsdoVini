"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Office, Role } from "@prisma/client";
import UserDrawer, { DrawerMode, OwnerOption, UserDrawerPayload } from "./UserDrawer";
import { canManageUsers, isConsultor } from "@/lib/authRoles";
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

const profileColors: Record<Role, string> = {
  MASTER: "bg-purple-50 text-purple-700 ring-purple-200",
  GERENTE_SENIOR: "bg-blue-50 text-blue-700 ring-blue-200",
  GERENTE_NEGOCIOS: "bg-sky-50 text-sky-700 ring-sky-200",
  PROPRIETARIO: "bg-amber-50 text-amber-700 ring-amber-200",
  CONSULTOR: "bg-emerald-50 text-emerald-700 ring-emerald-200",
};

function mapOfficeCodeToEnum(code?: string): Office | null {
  if (!code) return null;
  const normalized = code.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  const values = Object.values(Office) as string[];
  return values.includes(normalized) ? (normalized as Office) : null;
}

export default function AdminUsersPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [offices, setOffices] = useState<OfficeRecordDto[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [officesLoading, setOfficesLoading] = useState(true);
  const [usersError, setUsersError] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>("create");
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [drawerSubmitting, setDrawerSubmitting] = useState(false);
  const [profileFilter, setProfileFilter] = useState<Role | "ALL">("ALL");

  useEffect(() => {
    if (status === "authenticated" && isConsultor(session?.user.role)) {
      router.replace("/board");
    }
  }, [status, session?.user.role, router]);

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
    setOfficesLoading(true);
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
    } finally {
      setOfficesLoading(false);
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
  }

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

    const newPassword = Math.random().toString(36).slice(-8); // Generate 8 char random string

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

  if (status === "loading" || !canViewUsers) return null;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500 font-bold">Administração</p>
          <h1 className="text-3xl font-bold text-slate-900 mt-1">Gestão de Usuários</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={openCreateDrawer}
            className="flex items-center gap-2 rounded-lg bg-neon-green px-5 py-2.5 text-sm font-bold text-slate-900 shadow-lg shadow-neon-green/20 hover:bg-emerald-400 hover:scale-105 transition-all"
          >
            <Plus className="w-4 h-4" />
            Novo Usuário
          </button>
        </div>
      </header>

      {/* Filtros e Controles */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-600">Filtrar por:</span>
          <select
            value={profileFilter}
            onChange={(e) => setProfileFilter(e.target.value as Role | "ALL")}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-200"
          >
            <option value="ALL">Todos os perfis</option>
            <option value={Role.MASTER}>Master</option>
            <option value={Role.GERENTE_SENIOR}>Gerente Sênior</option>
            <option value={Role.GERENTE_NEGOCIOS}>Gerente de Negócios</option>
            <option value={Role.PROPRIETARIO}>Proprietário</option>
            <option value={Role.CONSULTOR}>Consultor</option>
          </select>
        </div>

        <button
          onClick={loadUsers}
          className="text-sm font-semibold text-slate-500 hover:text-slate-900 transition-colors"
        >
          Atualizar Lista
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {usersLoading ? (
          <div className="p-12 text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite] text-slate-400" role="status"></div>
            <p className="mt-4 text-sm text-slate-500 font-medium">Carregando equipe...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                  <th className="px-6 py-4">Usuário</th>
                  <th className="px-6 py-4">Perfil</th>
                  <th className="px-6 py-4">Escritório</th>
                  <th className="px-6 py-4">Responsável (Owner)</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-semibold text-slate-900 text-base">{user.name}</span>
                        <span className="text-slate-500">{user.email}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ring-inset ${profileColors[user.role]}`}
                      >
                        {profileLabels[user.role]}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-700">
                      {user.officeRecord ? (
                        <div className="flex flex-col">
                          <span className="font-semibold text-slate-900">{user.officeRecord.name}</span>
                          <span className="text-xs font-mono text-slate-400">{user.officeRecord.code}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">Global / Nenhum</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-slate-700">
                      {user.owner ? (
                        <div className="flex flex-col">
                          <span className="text-slate-900 font-medium">{user.owner.name}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex h-2 w-2 rounded-full mr-2 ${user.active ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
                      <span className={`text-xs font-semibold ${user.active ? 'text-emerald-700' : 'text-red-700'}`}>
                        {user.active ? "Ativo" : "Bloqueado"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => openEditDrawer(user)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-900 hover:text-white hover:border-slate-900 active:scale-95"
                      >
                        Gerenciar
                      </button>
                    </td>
                  </tr>
                ))}
                {!filteredUsers.length && (
                  <tr>
                    <td className="px-6 py-12 text-center text-slate-500" colSpan={6}>
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
