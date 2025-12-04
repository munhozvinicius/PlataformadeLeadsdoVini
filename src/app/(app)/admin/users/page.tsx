"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Office, Role } from "@prisma/client";
import UserDrawer, {
  DrawerMode,
  OwnerOption,
  UserDrawerPayload,
} from "./UserDrawer";
import { canManageUsers, isConsultor } from "@/lib/authRoles";

type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  office: Office;
  officeRecord?: { id: string; name: string; code: string } | null;
  owner?: {
    id: string;
    name: string;
    email: string;
    senior?: { id: string; name?: string | null; email?: string | null } | null;
    officeRecord?: { id: string; name: string; code: string } | null;
  } | null;
  senior?: { id: string; name?: string | null } | null;
  offices: { office: Office }[];
  active: boolean;
  derivedGS?: { id: string; name?: string | null; email?: string | null } | null;
  derivedGN?: { id: string; name?: string | null; email?: string | null } | null;
};

type OfficeRecordDto = {
  id: string;
  code: string;
  name: string;
  createdAt: string;
};

function generatePassword() {
  return `P${Math.random().toString(36).slice(2, 10)}!`;
}

export default function AdminUsersPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
const [offices, setOffices] = useState<OfficeRecordDto[]>([]);
  const [officesLoading, setOfficesLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>("create");
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [drawerSubmitting, setDrawerSubmitting] = useState(false);
  const [officeModalOpen, setOfficeModalOpen] = useState(false);
  const [officeSubmitting, setOfficeSubmitting] = useState(false);
  const [officeError, setOfficeError] = useState("");
  const [officeForm, setOfficeForm] = useState({
    code: "",
    name: "",
    seniorManagerId: "",
    businessManagerId: "",
    ownerId: "",
  });

  useEffect(() => {
    if (status === "authenticated" && isConsultor(session?.user.role)) {
      router.replace("/board");
    }
  }, [status, session?.user.role, router]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/users", { cache: "no-store" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.message ?? "Não foi possível carregar os usuários.");
      }
      const data: AdminUser[] = await response.json();
      setUsers(data);
    } catch (err) {
      console.error("Erro ao carregar usuários", err);
      setError((err as Error)?.message ?? "Não foi possível carregar os usuários.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadOffices = useCallback(async () => {
    setOfficesLoading(true);
    try {
      const response = await fetch("/api/offices", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Não foi possível carregar os escritórios.");
      }
      const data: OfficeRecordDto[] = await response.json();
      setOffices(data);
    } catch (err) {
      console.error("Erro ao carregar escritórios", err);
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

  const gsOptions = useMemo(() => users.filter((user) => user.role === Role.GERENTE_SENIOR), [users]);
  const gnOptions = useMemo(() => users.filter((user) => user.role === Role.GERENTE_NEGOCIOS), [users]);
  const proprietorOptions = useMemo(() => ownerOptions, [ownerOptions]);

  const canManageOffices = (session?.user.role === Role.MASTER || session?.user.role === Role.GERENTE_SENIOR) ?? false;

  const resetOfficeForm = useCallback(() => {
    setOfficeForm({
      code: "",
      name: "",
      seniorManagerId: "",
      businessManagerId: "",
      ownerId: "",
    });
    setOfficeError("");
  }, []);

  const closeOfficeModal = useCallback(() => {
    resetOfficeForm();
    setOfficeModalOpen(false);
  }, [resetOfficeForm]);

  const handleOfficeSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setOfficeError("");
      if (!officeForm.code.trim()) {
        setOfficeError("Informe o código do escritório.");
        return;
      }
      if (!officeForm.name.trim()) {
        setOfficeError("Informe o nome do escritório.");
        return;
      }
      setOfficeSubmitting(true);
      try {
        const response = await fetch("/api/offices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: officeForm.code.trim(),
            name: officeForm.name.trim(),
            seniorManagerId: officeForm.seniorManagerId || undefined,
            businessManagerId: officeForm.businessManagerId || undefined,
            ownerId: officeForm.ownerId || undefined,
          }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body?.message ?? "Não foi possível criar o escritório.");
        }
        await loadOffices();
        resetOfficeForm();
        closeOfficeModal();
      } catch (submitError) {
        console.error("Erro ao criar escritório", submitError);
        setOfficeError((submitError as Error)?.message ?? "Não foi possível criar o escritório.");
      } finally {
        setOfficeSubmitting(false);
      }
    },
    [officeForm, loadOffices, resetOfficeForm, closeOfficeModal]
  );

  const filteredUsers = useMemo(() => {
    if (session?.user.role === Role.MASTER || session?.user.role === Role.GERENTE_SENIOR) return users;
    if (session?.user.role === Role.PROPRIETARIO) {
      return users.filter((user) => user.id === session.user.id || user.owner?.id === session.user.id);
    }
    return [];
  }, [users, session]);

  const hierarchyRows = useMemo(() => {
    const depthMap: Record<Role, number> = {
      [Role.MASTER]: 0,
      [Role.GERENTE_SENIOR]: 0,
      [Role.GERENTE_NEGOCIOS]: 1,
      [Role.PROPRIETARIO]: 2,
      [Role.CONSULTOR]: 3,
    };

    const officeGroups = new Map<string, AdminUser[]>();
    filteredUsers.forEach((user) => {
      const key = user.offices[0]?.office ?? "Sem escritório";
      const list = officeGroups.get(key) ?? [];
      list.push(user);
      officeGroups.set(key, list);
    });

    const findManager = (officeValue: string | undefined, managerRole: Role) =>
      filteredUsers.find((user) => user.offices[0]?.office === officeValue && user.role === managerRole);

    const rows: { user: AdminUser; depth: number; gsName: string; gnName: string; ownerName: string }[] = [];
    const offices = Array.from(officeGroups.keys()).sort((a, b) => a.localeCompare(b));
    offices.forEach((office) => {
      const officeUsers = officeGroups.get(office) ?? [];
      const sorted = [...officeUsers].sort((a, b) => {
        const depthA = depthMap[a.role] ?? 0;
        const depthB = depthMap[b.role] ?? 0;
        if (depthA !== depthB) return depthA - depthB;
        return a.name.localeCompare(b.name);
      });


      const officeGSName = findManager(office, Role.GERENTE_SENIOR)?.name ?? "-";
      const officeGNName = findManager(office, Role.GERENTE_NEGOCIOS)?.name ?? "-";

      sorted.forEach((user) => {
        const gsName =
          user.derivedGS?.name ?? (user.role === Role.GERENTE_SENIOR ? user.name : officeGSName);
        const gnName = user.derivedGN?.name ?? (user.role === Role.GERENTE_NEGOCIOS ? user.name : officeGNName);
        const ownerName =
          user.role === Role.PROPRIETARIO
            ? user.name
            : user.owner?.name ?? "-";

        rows.push({
          user,
          depth: depthMap[user.role] ?? 0,
          gsName,
          gnName,
          ownerName,
        });
      });
    });
    return rows;
  }, [filteredUsers]);

  const canViewUsers = canManageUsers(session?.user.role);
  const currentSessionUser = users.find((user) => user.id === session?.user.id);

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
    setDrawerMode("create");
  };

  const handleUserSubmit = useCallback(
    async (payload: UserDrawerPayload) => {
      setDrawerSubmitting(true);
      try {
        const endpoint =
          drawerMode === "create" ? "/api/admin/users" : `/api/admin/users/${selectedUser?.id}`;
        const response = await fetch(endpoint, {
          method: drawerMode === "create" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body?.message ?? "Não foi possível salvar o usuário.");
        }
        await loadUsers();
      } finally {
        setDrawerSubmitting(false);
      }
    },
    [drawerMode, loadUsers, selectedUser?.id]
  );

  const handleResetPassword = useCallback(async () => {
    if (!selectedUser) {
      throw new Error("Selecione um usuário antes de resetar a senha.");
    }
    const newPassword = generatePassword();

    const response = await fetch(`/api/admin/users/${selectedUser.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: newPassword }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body?.message ?? "Não foi possível resetar a senha.");
    }
    await loadUsers();
    return newPassword;
  }, [loadUsers, selectedUser]);

  if (status === "loading" || !canViewUsers) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Master</p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Usuários</h1>
            <p className="text-sm text-slate-500">
              Crie e gerencie proprietários, consultores e gerentes de negócio.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={openCreateDrawer}
              disabled={officesLoading || offices.length === 0}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Novo usuário
            </button>
            {canManageOffices && (
              <button
                type="button"
                onClick={() => setOfficeModalOpen(true)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100"
              >
                Criar escritório
              </button>
            )}
            <button
              onClick={loadUsers}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100"
            >
              Atualizar
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-slate-900">Lista</h2>
        </div>
        {error ? <div className="text-sm text-red-600 mb-2">{error}</div> : null}
        {loading ? (
          <div className="text-sm text-slate-500">Carregando...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b">
                  <th className="py-2 pr-3">Nome</th>
                  <th className="py-2 pr-3">Email</th>
                  <th className="py-2 pr-3">Escritórios</th>
                  <th className="py-2 pr-3">Perfil</th>
                  <th className="py-2 pr-3">Gerente Sênior</th>
                  <th className="py-2 pr-3">Gerente de Negócios</th>
                  <th className="py-2 pr-3">Owner</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Ações</th>
                </tr>
              </thead>
              <tbody>
                {hierarchyRows.map((row) => (
                  <tr key={row.user.id} className="border-b last:border-b-0">
                    <td className="py-2 pr-3">
                      <span style={{ paddingLeft: `${row.depth * 1.5}rem` }}>{row.user.name}</span>
                    </td>
                    <td className="py-2 pr-3">{row.user.email}</td>
                    <td className="py-2 pr-3">
                      {row.user.officeRecord?.name ?? row.user.officeRecord?.code ?? "-"}
                    </td>
                    <td className="py-2 pr-3">{row.user.role}</td>
                    <td className="py-2 pr-3">{row.gsName}</td>
                    <td className="py-2 pr-3">{row.gnName}</td>
                    <td className="py-2 pr-3">
                      {row.user.owner
                        ? `${row.user.owner.name} (${row.user.owner.email})`
                        : row.user.senior
                        ? `GS: ${row.user.senior.name}`
                        : "-"}
                    </td>
                    <td className="py-2 pr-3">
                      {row.user.active ? (
                        <span className="text-emerald-600">Ativo</span>
                      ) : (
                        <span className="text-red-600">Inativo</span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <button
                        className="text-slate-600 hover:text-slate-900"
                        onClick={() => openEditDrawer(row.user)}
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <UserDrawer
        open={drawerOpen}
        mode={drawerMode}
        user={selectedUser ?? undefined}
        offices={offices}
        owners={ownerOptions}
        isSubmitting={drawerSubmitting}
        onClose={closeDrawer}
        onSubmit={handleUserSubmit}
        onResetPassword={drawerMode === "edit" ? handleResetPassword : undefined}
        currentUserRole={session?.user.role}
        currentUserId={session?.user.id}
        currentUserOfficeRecordId={currentSessionUser?.officeRecord?.id ?? null}
      />
      {officeModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40"
          onMouseDown={closeOfficeModal}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900">Novo escritório</h3>
              <button
                type="button"
                className="text-slate-500 hover:text-slate-900"
                onClick={closeOfficeModal}
              >
                Fechar
              </button>
            </div>
            <form className="space-y-4" onSubmit={handleOfficeSubmit}>
              {officeError ? <p className="text-sm text-red-600">{officeError}</p> : null}
              <div className="space-y-1">
                <label className="text-xs text-slate-600">Código do escritório</label>
                <input
                  value={officeForm.code}
                  onChange={(event) =>
                    setOfficeForm((prev) => ({ ...prev, code: event.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  placeholder="Ex: SAFE_TI, JLC_TECH, PV Ribeirão Preto"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-600">Nome</label>
                <input
                  value={officeForm.name}
                  onChange={(event) =>
                    setOfficeForm((prev) => ({ ...prev, name: event.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-600">Gerente Sênior</label>
                <select
                  value={officeForm.seniorManagerId}
                  onChange={(event) =>
                    setOfficeForm((prev) => ({ ...prev, seniorManagerId: event.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="">Nenhum</option>
                  {gsOptions.map((gs) => (
                    <option key={gs.id} value={gs.id}>
                      {gs.name} ({gs.email})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-600">Gerente de Negócios</label>
                <select
                  value={officeForm.businessManagerId}
                  onChange={(event) =>
                    setOfficeForm((prev) => ({ ...prev, businessManagerId: event.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="">Nenhum</option>
                  {gnOptions.map((gn) => (
                    <option key={gn.id} value={gn.id}>
                      {gn.name} ({gn.email})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-600">Proprietário</label>
                <select
                  value={officeForm.ownerId}
                  onChange={(event) =>
                    setOfficeForm((prev) => ({ ...prev, ownerId: event.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="">Nenhum</option>
                  {proprietorOptions.map((ownerOption) => (
                    <option key={ownerOption.id} value={ownerOption.id}>
                      {ownerOption.name} ({ownerOption.email})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={closeOfficeModal}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={officeSubmitting}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {officeSubmitting ? "Salvando..." : "Criar escritório"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
