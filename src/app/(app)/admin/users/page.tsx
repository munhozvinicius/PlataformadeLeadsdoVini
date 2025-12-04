"use client";

import { Office, Role } from "@prisma/client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  office: Office;
  owner?: { id: string; name: string; email: string };
  active: boolean;
};

export default function AdminUsersPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<{
    name: string;
    email: string;
    password: string;
    role: Role;
    ownerId: string;
    office: Office;
  }>({
    name: "",
    email: "",
    password: "",
    role: Role.PROPRIETARIO,
    ownerId: "",
    office: Office.SAFE_TI,
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (status === "authenticated" && session?.user.role !== "MASTER") {
      router.replace("/board");
    }
  }, [status, session, router]);

  const owners = useMemo(
    () => users.filter((u) => u.role === Role.PROPRIETARIO && u.office === form.office),
    [users, form.office]
  );

  const filteredUsers = useMemo(() => {
    if (session?.user.role === Role.MASTER) return users;
    if (session?.user.role === Role.PROPRIETARIO) {
      return users.filter(
        (u) => u.id === session.user.id || u.owner?.id === session.user.id
      );
    }
    return users.filter((u) => u.id === session?.user.id);
  }, [users, session]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.message ?? "Não foi possível carregar os usuários.");
        return;
      }
      const data = await res.json();
      setUsers(data);
    } catch (err) {
      console.error("Erro ao carregar usuários", err);
      setError("Não foi possível carregar os usuários.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated" && session?.user.role === Role.MASTER) {
      loadUsers();
    }
  }, [status, session?.user.role, loadUsers]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);

    const sessionRole = session?.user.role;
    const creatingAsProprietario = sessionRole === Role.PROPRIETARIO;
    const roleToSend = creatingAsProprietario ? Role.CONSULTOR : form.role;

    const ownerIdToSend =
      roleToSend === Role.CONSULTOR
        ? creatingAsProprietario
          ? session?.user.id
          : form.ownerId
        : null;

    if (roleToSend === Role.CONSULTOR && !ownerIdToSend) {
      setSaving(false);
      setError("Selecione um proprietário responsável.");
      return;
    }

    const officeToSend =
      creatingAsProprietario && session?.user.id
        ? users.find((u) => u.id === session.user.id)?.office ?? form.office
        : form.office;

    const payload = {
      name: form.name,
      email: form.email,
      password: form.password,
      role: roleToSend,
      ownerId: ownerIdToSend,
      office: officeToSend,
    };
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (!res.ok) {
      setError("Não foi possível criar o usuário.");
      return;
    }
    setForm({
      name: "",
      email: "",
      password: "",
      role: Role.PROPRIETARIO,
      ownerId: "",
      office: Office.SAFE_TI,
    });
    await loadUsers();
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Master</p>
        <h1 className="text-2xl font-semibold text-slate-900">Usuários</h1>
        <p className="text-sm text-slate-500">Crie PROPRIETÁRIOS e CONSULTORs e vincule as equipes.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-slate-900">Lista</h2>
            <button
              onClick={loadUsers}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-100"
            >
              Atualizar
            </button>
          </div>
          {loading ? <div>Carregando...</div> : null}
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b">
                  <th className="py-2 pr-3">Nome</th>
                  <th className="py-2 pr-3">Email</th>
                  <th className="py-2 pr-3">Perfil</th>
                  <th className="py-2 pr-3">Escritório</th>
                  <th className="py-2 pr-3">Owner</th>
                  <th className="py-2 pr-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="border-b last:border-b-0">
                    <td className="py-2 pr-3">{user.name}</td>
                    <td className="py-2 pr-3">{user.email}</td>
                    <td className="py-2 pr-3">{user.role}</td>
                    <td className="py-2 pr-3">{user.office}</td>
                    <td className="py-2 pr-3">
                      {user.owner ? `${user.owner.name} (${user.owner.email})` : "-"}
                    </td>
                    <td className="py-2 pr-3">
                      {user.active ? (
                        <span className="text-emerald-600">Ativo</span>
                      ) : (
                        <span className="text-red-600">Inativo</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-3">Novo usuário</h2>
          {error ? <div className="text-sm text-red-600 mb-2">{error}</div> : null}
          <form className="space-y-3" onSubmit={handleSubmit}>
            {session?.user.role === Role.MASTER ? (
              <div className="space-y-1">
                <label className="text-xs text-slate-600">Escritório</label>
                <select
                  value={form.office}
                  onChange={(e) => setForm({ ...form, office: e.target.value as Office })}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                >
                  <option value={Office.JLC_TECH}>JLC Tech</option>
                  <option value={Office.SAFE_TI}>Safe TI</option>
                </select>
              </div>
            ) : (
              <div className="space-y-1">
                <label className="text-xs text-slate-600">Escritório</label>
                <input
                  value={users.find((u) => u.id === session?.user.id)?.office ?? ""}
                  disabled
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-slate-100"
                />
                {session?.user.role === Role.PROPRIETARIO ? (
                  <p className="text-xs text-slate-500">
                    Consultores criados neste espaço automaticamente herdam seu escritório.
                  </p>
                ) : null}
              </div>
            )}
            <div className="space-y-1">
              <label className="text-xs text-slate-600">Nome</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-600">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-600">Senha</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm"
                required
              />
            </div>
            {session?.user.role === Role.MASTER ? (
              <div className="space-y-1">
                <label className="text-xs text-slate-600">Perfil</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                >
                  <option value={Role.PROPRIETARIO}>PROPRIETÁRIO</option>
                  <option value={Role.CONSULTOR}>CONSULTOR</option>
                </select>
              </div>
            ) : (
              <div className="space-y-1">
                <label className="text-xs text-slate-600">Perfil</label>
                <input
                  value="CONSULTOR"
                  disabled
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-slate-100"
                />
              </div>
            )}
            {session?.user.role === Role.MASTER && form.role === Role.CONSULTOR ? (
              <div className="space-y-1">
                <label className="text-xs text-slate-600">Proprietário responsável</label>
                <select
                  value={form.ownerId}
                  onChange={(e) => setForm({ ...form, ownerId: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  required
                >
                  <option value="">Selecione</option>
                  {owners.map((owner) => (
                    <option key={owner.id} value={owner.id}>
                      {owner.name} ({owner.email})
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-lg bg-slate-900 text-white py-2 text-sm font-semibold hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? "Salvando..." : "Criar usuário"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
