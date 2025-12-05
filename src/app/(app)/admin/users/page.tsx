"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Office, Role } from "@prisma/client";
import UserDrawer, { DrawerMode, OwnerOption, UserDrawerPayload } from "./UserDrawer";
import { canManageUsers, isConsultor } from "@/lib/authRoles";

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

type CreateFormState = {
  name: string;
  email: string;
  password: string;
  role: Role;
  officeRecordId: string;
  ownerId: string;
};

const initialCreateForm: CreateFormState = {
  name: "",
  email: "",
  password: "",
  role: Role.PROPRIETARIO,
  officeRecordId: "",
  ownerId: "",
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

const PROFILE_OPTIONS: { value: Role; label: string }[] = [
  { value: Role.GERENTE_SENIOR, label: "Gerente Sênior" },
  { value: Role.GERENTE_NEGOCIOS, label: "Gerente de Negócios" },
  { value: Role.PROPRIETARIO, label: "Proprietário" },
  { value: Role.CONSULTOR, label: "Consultor" },
];

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
  const [createForm, setCreateForm] = useState<CreateFormState>(initialCreateForm);
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>("edit");
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

  const canCreateProfileOptions = useMemo(() => {
    const currentProfile = session?.user.role;
    if (currentProfile === Role.MASTER) return PROFILE_OPTIONS;
    if (currentProfile === Role.GERENTE_SENIOR) {
      const allowed: Role[] = [Role.GERENTE_NEGOCIOS, Role.PROPRIETARIO, Role.CONSULTOR];
      return PROFILE_OPTIONS.filter((opt) => allowed.includes(opt.value));
    }
    if (currentProfile === Role.GERENTE_NEGOCIOS || currentProfile === Role.PROPRIETARIO) {
      return PROFILE_OPTIONS.filter((opt) => opt.value === Role.CONSULTOR);
    }
    return [];
  }, [session?.user.role]);

  useEffect(() => {
    if (canCreateProfileOptions.length === 0) return;
    if (!canCreateProfileOptions.find((opt) => opt.value === createForm.role)) {
      setCreateForm((prev) => ({ ...prev, role: canCreateProfileOptions[0].value }));
    }
  }, [canCreateProfileOptions, createForm.role]);

  const filteredUsers = useMemo(() => {
    if (profileFilter === "ALL") return users;
    return users.filter((user) => user.role === profileFilter);
  }, [users, profileFilter]);

  const openEditDrawer = (user: AdminUser) => {
    setDrawerMode("edit");
    setSelectedUser(user);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setSelectedUser(null);
    setDrawerMode("edit");
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

  const handleCreateSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreateError("");
    if (!createForm.name.trim() || !createForm.email.trim() || !createForm.password.trim()) {
      setCreateError("Preencha nome, email e senha.");
      return;
    }

    if (createForm.role === Role.CONSULTOR && (!createForm.officeRecordId || !createForm.ownerId)) {
      setCreateError("Consultor precisa de escritório e proprietário.");
      return;
    }

    const officeCode = activeOffices.find((office) => office.id === createForm.officeRecordId)?.code;
    const officeEnum = mapOfficeCodeToEnum(officeCode);

    const managedOfficeIds =
      createForm.role === Role.GERENTE_NEGOCIOS
        ? createForm.officeRecordId
          ? [createForm.officeRecordId]
          : []
        : [];

    const payload: Partial<UserDrawerPayload> = {
      name: createForm.name.trim(),
      email: createForm.email.trim(),
      password: createForm.password,
      role: createForm.role,
      officeRecordId: createForm.officeRecordId || null,
      ownerId: createForm.role === Role.CONSULTOR ? createForm.ownerId || null : null,
      officeIds: officeEnum ? [officeEnum] : [],
      managedOfficeIds,
    };

    setCreating(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message ?? "Não foi possível criar o usuário.");
      }
      setCreateForm(initialCreateForm);
      await loadUsers();
    } catch (err) {
      console.error(err);
      setCreateError((err as Error)?.message ?? "Erro ao criar usuário.");
    } finally {
      setCreating(false);
    }
  };

  const currentSessionUser = users.find((user) => user.id === session?.user.id);
  const canViewUsers = canManageUsers(session?.user.role);

  if (status === "loading" || !canViewUsers) return null;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Master</p>
          <h1 className="text-3xl font-semibold text-slate-900">Usuários</h1>
          <p className="text-sm text-slate-500">
            Crie proprietários e consultores e vincule-os a escritórios e hierarquias.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadUsers}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100"
          >
            Atualizar
          </button>
        </div>
      </header>

      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Novo usuário</h2>
        </div>
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          {createError ? <p className="text-sm text-red-600">{createError}</p> : null}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs text-slate-600">Nome</label>
              <input
                value={createForm.name}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-600">Email</label>
              <input
                type="email"
                value={createForm.email}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, email: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-600">Senha</label>
              <input
                type="password"
                value={createForm.password}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, password: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-600">Perfil</label>
              <select
                value={createForm.role}
                onChange={(e) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    role: e.target.value as Role,
                    ownerId: e.target.value === Role.CONSULTOR ? prev.ownerId : "",
                  }))
                }
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <option value="">Selecione</option>
                {canCreateProfileOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-600">
                Escritório{" "}
                <span className="text-slate-400 text-[11px]">
                  (opcional para proprietário)
                </span>
              </label>
              <select
                value={createForm.officeRecordId}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, officeRecordId: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                disabled={officesLoading}
              >
                <option value="">
                  {createForm.role === Role.CONSULTOR
                    ? "Selecione um escritório (obrigatório)"
                    : "Selecione um escritório (opcional)"}
                </option>
                {activeOffices.map((office) => (
                  <option key={office.id} value={office.id}>
                    {office.name}
                  </option>
                ))}
              </select>
              <Link href="/admin/offices" className="text-xs font-semibold text-slate-700 hover:text-slate-900">
                Gerenciar escritórios
              </Link>
            </div>
            {createForm.role === Role.CONSULTOR ? (
              <div className="space-y-1">
                <label className="text-xs text-slate-600">Proprietário (GN)</label>
                <select
                  value={createForm.ownerId}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, ownerId: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="">Selecione o proprietário (GN)</option>
                  {ownerOptions.map((owner) => (
                    <option key={owner.id} value={owner.id}>
                      {owner.name} ({owner.email})
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setCreateForm(initialCreateForm);
                setCreateError("");
              }}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Limpar
            </button>
            <button
              type="submit"
              disabled={
                creating || (createForm.role === Role.CONSULTOR && (!createForm.officeRecordId || !createForm.ownerId))
              }
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {creating ? "Salvando..." : "Criar usuário"}
            </button>
          </div>
        </form>
      </div>

      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Usuários cadastrados</h2>
            {usersError ? <p className="text-sm text-red-600">{usersError}</p> : null}
          </div>
          <div className="flex items-center gap-2">
            <select
              value={profileFilter}
              onChange={(e) => setProfileFilter(e.target.value as Role | "ALL")}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
            >
              <option value="ALL">Todos os perfis</option>
              <option value={Role.MASTER}>Master</option>
              <option value={Role.PROPRIETARIO}>Proprietário</option>
              <option value={Role.CONSULTOR}>Consultor</option>
              <option value={Role.GERENTE_NEGOCIOS}>Gerente de Negócios</option>
            </select>
            <button
              onClick={loadUsers}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100"
            >
              Atualizar
            </button>
          </div>
        </div>
        {usersLoading ? (
          <p className="text-sm text-slate-500">Carregando usuários...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-slate-600">
                  <th className="px-3 py-2 font-semibold">Nome</th>
                  <th className="px-3 py-2 font-semibold">Email</th>
                  <th className="px-3 py-2 font-semibold">Perfil</th>
                  <th className="px-3 py-2 font-semibold">Escritório</th>
                  <th className="px-3 py-2 font-semibold">Owner</th>
                  <th className="px-3 py-2 font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="border-b last:border-b-0">
                    <td className="px-3 py-2 font-medium text-slate-900">{user.name}</td>
                    <td className="px-3 py-2 text-slate-600">{user.email}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ${profileColors[user.role]}`}
                      >
                        {profileLabels[user.role]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {user.officeRecord ? (
                        <div className="space-y-0.5">
                          <p className="font-semibold text-slate-900">{user.officeRecord.name}</p>
                          <p className="text-xs uppercase tracking-wide text-slate-500">{user.officeRecord.code}</p>
                        </div>
                      ) : (
                        <span className="text-slate-500">{user.office ?? "-"}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {user.owner ? `${user.owner.name} (${user.owner.email})` : "-"}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <button
                          onClick={() => openEditDrawer(user)}
                          className="rounded-lg border border-slate-200 px-3 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Editar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!filteredUsers.length ? (
                  <tr>
                    <td className="px-3 py-3 text-sm text-slate-500" colSpan={6}>
                      Nenhum usuário encontrado.
                    </td>
                  </tr>
                ) : null}
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
        currentUserRole={session?.user.role}
        currentUserId={session?.user.id}
        currentUserOfficeRecordId={currentSessionUser?.officeRecord?.id ?? null}
      />
    </div>
  );
}
