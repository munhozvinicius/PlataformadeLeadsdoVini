"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

type User = {
  id: string;
  name: string;
  email: string;
  role: "MASTER" | "OWNER" | "CONSULTOR";
  escritorio: "JLC_TECH" | "SAFE_TI";
  owner?: { id: string; name: string; email: string };
};

export default function AdminUsersPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "OWNER",
    owner: "",
    escritorio: "JLC_TECH",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (status === "authenticated" && session?.user.role !== "MASTER") {
      router.replace("/board");
    }
  }, [status, session, router]);

  useEffect(() => {
    loadUsers();
  }, []);

  const owners = useMemo(
    () => users.filter((u) => u.role === "OWNER" && u.escritorio === form.escritorio),
    [users, form.escritorio]
  );

  const filteredUsers = useMemo(() => {
    if (session?.user.role === "MASTER") return users;
    // owner vê somente a si e consultores vinculados
    return users.filter((u) => u.id === session?.user.id || u.owner?.id === session?.user.id);
  }, [users, session]);

  async function loadUsers() {
    setLoading(true);
    const res = await fetch("/api/admin/users", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      setUsers(data);
    }
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);

    const roleToSend =
      session?.user.role === "OWNER"
        ? ("CONSULTOR" as const)
        : (form.role as "OWNER" | "CONSULTOR");
    const ownerIdToSend =
      roleToSend === "CONSULTOR"
        ? session?.user.role === "OWNER"
          ? session.user.id
          : form.owner
        : null;
    const escritorioToSend =
      session?.user.role === "OWNER" ? users.find((u) => u.id === session.user.id)?.escritorio : form.escritorio;
    const payload = {
      name: form.name,
      email: form.email,
      password: form.password,
      role: roleToSend,
      ownerId: ownerIdToSend,
      escritorio: escritorioToSend,
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
      role: "OWNER",
      owner: "",
      escritorio: "JLC_TECH",
    });
    await loadUsers();
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Master</p>
        <h1 className="text-2xl font-semibold text-slate-900">Usuários</h1>
        <p className="text-sm text-slate-500">Crie OWNER e CONSULTOR e vincule as equipes.</p>
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
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="border-b last:border-b-0">
                    <td className="py-2 pr-3">{user.name}</td>
                    <td className="py-2 pr-3">{user.email}</td>
                    <td className="py-2 pr-3">{user.role}</td>
                    <td className="py-2 pr-3">{user.escritorio}</td>
                    <td className="py-2 pr-3">
                      {user.owner ? `${user.owner.name} (${user.owner.email})` : "-"}
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
            {session?.user.role === "MASTER" ? (
              <div className="space-y-1">
                <label className="text-xs text-slate-600">Escritório</label>
                <select
                  value={form.escritorio}
                  onChange={(e) => setForm({ ...form, escritorio: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                >
                  <option value="JLC_TECH">JLC Tech</option>
                  <option value="SAFE_TI">Safe TI</option>
                </select>
              </div>
            ) : (
              <div className="space-y-1">
                <label className="text-xs text-slate-600">Escritório</label>
                <input
                  value={users.find((u) => u.id === session?.user.id)?.escritorio ?? ""}
                  disabled
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-slate-100"
                />
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
            {session?.user.role === "MASTER" ? (
              <div className="space-y-1">
                <label className="text-xs text-slate-600">Perfil</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                >
                  <option value="OWNER">OWNER</option>
                  <option value="CONSULTOR">CONSULTOR</option>
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
            {(session?.user.role === "MASTER" ? form.role === "CONSULTOR" : true) ? (
              <div className="space-y-1">
                <label className="text-xs text-slate-600">Owner responsável</label>
                <select
                  value={form.owner}
                  onChange={(e) => setForm({ ...form, owner: e.target.value })}
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
