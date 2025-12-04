"use client";

import { Office, Role } from "@prisma/client";
import { FormEvent, useEffect, useMemo, useState } from "react";

export type OwnerOption = {
  id: string;
  name: string;
  email: string;
  office: Office;
};

export type OfficeOption = {
  id: string;
  name: string;
  office: Office;
};

export type DrawerMode = "create" | "edit";

export type UserDrawerPayload = {
  name: string;
  email: string;
  role: Role;
  officeId?: string | null;
  ownerId?: string | null;
  password?: string;
  active?: boolean;
};

type UserData = {
  id: string;
  name: string;
  email: string;
  role: Role;
  office: Office;
  active: boolean;
  owner?: { id: string } | null;
  officeRecord?: { id: string } | null;
};

type UserDrawerProps = {
  open: boolean;
  mode: DrawerMode;
  user?: UserData;
  offices: OfficeOption[];
  owners: OwnerOption[];
  isSubmitting?: boolean;
  onClose: () => void;
  onSubmit: (payload: UserDrawerPayload) => Promise<void>;
  onResetPassword?: () => Promise<string | void>;
};

const roleLabels: Record<Role, string> = {
  MASTER: "MASTER",
  GERENTE_SENIOR: "GERENTE SÊNIOR",
  GERENTE_NEGOCIOS: "GERENTE DE NEGÓCIOS",
  PROPRIETARIO: "PROPRIETÁRIO",
  CONSULTOR: "CONSULTOR",
};

export default function UserDrawer({
  open,
  mode,
  user,
  offices,
  owners,
  isSubmitting,
  onClose,
  onSubmit,
  onResetPassword,
}: UserDrawerProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>(Role.PROPRIETARIO);
  const [password, setPassword] = useState("");
  const [selectedOfficeId, setSelectedOfficeId] = useState<string | null>(null);
  const [ownerId, setOwnerId] = useState<string>("");
  const [active, setActive] = useState(true);
  const [error, setError] = useState("");
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  const officeRoles: Role[] = [Role.GERENTE_NEGOCIOS, Role.PROPRIETARIO, Role.CONSULTOR];
  const showOfficeField = officeRoles.includes(role);
  const requiresOffice = showOfficeField;
  const requiresOwner = role === Role.CONSULTOR;

  const ownersForOffice = useMemo(() => {
    if (!selectedOfficeId) return [];
    const officeOfSelection = offices.find((office) => office.id === selectedOfficeId);
    if (!officeOfSelection) return [];
    return owners.filter((owner) => owner.office === officeOfSelection.office);
  }, [owners, offices, selectedOfficeId]);

  useEffect(() => {
    if (!open) {
      setError("");
      setResetMessage(null);
      return;
    }

    setName(user?.name ?? "");
    setEmail(user?.email ?? "");
    setRole(user?.role ?? Role.PROPRIETARIO);
    setActive(user?.active ?? true);
    setPassword("");
    setError("");
    setResetMessage(null);
    const defaultOfficeId = user?.officeRecord?.id ?? offices[0]?.id ?? null;
    setSelectedOfficeId(defaultOfficeId);
    setOwnerId(user?.owner?.id ?? "");
  }, [open, user, offices]);

  useEffect(() => {
    if (ownerId && ownersForOffice.every((owner) => owner.id !== ownerId)) {
      setOwnerId("");
    }
  }, [ownersForOffice, ownerId]);

  if (!open) return null;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (!name.trim() || !email.trim()) {
      setError("Nome e email são obrigatórios.");
      return;
    }

    if (mode === "create" && !password.trim()) {
      setError("A senha é obrigatória na criação.");
      return;
    }

    if (requiresOffice && !selectedOfficeId) {
      setError("Selecione um escritório válido.");
      return;
    }

    if (requiresOwner && !ownerId) {
      setError("Escolha um proprietário responsável.");
      return;
    }

    const payload: UserDrawerPayload = {
      name: name.trim(),
      email: email.trim(),
      role,
      officeId: showOfficeField ? selectedOfficeId : null,
      ownerId: requiresOwner ? ownerId : null,
      active,
    };
    if (mode === "create") {
      payload.password = password;
    }

    try {
      await onSubmit(payload);
      onClose();
    } catch (submitError) {
      setError((submitError as Error)?.message ?? "Erro ao salvar usuário.");
    }
  };

  const handleResetPassword = async () => {
    if (!onResetPassword) return;
    setIsResetting(true);
    setResetMessage(null);
    try {
      const newPass = await onResetPassword();
      if (newPass) {
        setResetMessage(`Senha atualizada: ${newPass}`);
      }
    } catch (resetError) {
      setError((resetError as Error)?.message ?? "Erro ao resetar a senha.");
    } finally {
      setIsResetting(false);
    }
  };

  const heading = mode === "create" ? "Novo usuário" : "Editar usuário";
  const submitLabel = mode === "create" ? "Criar usuário" : "Salvar alterações";

  return (
    <div className="fixed inset-0 z-50 flex">
      <div
        className="absolute inset-0 bg-slate-900/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="ml-auto h-full w-full max-w-md bg-white p-6 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-900">{heading}</h3>
          <button
            type="button"
            className="text-slate-500 hover:text-slate-900"
            onClick={onClose}
          >
            Fechar
          </button>
        </div>
        <form className="space-y-4" onSubmit={handleSubmit}>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <div className="space-y-1">
            <label className="text-xs text-slate-600">Nome</label>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-slate-600">Email</label>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              required
            />
          </div>
          {mode === "create" ? (
            <div className="space-y-1">
              <label className="text-xs text-slate-600">Senha</label>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                required
              />
            </div>
          ) : null}
          <div className="space-y-1">
            <label className="text-xs text-slate-600">Perfil</label>
            <select
              value={role}
              onChange={(event) => {
                setRole(event.target.value as Role);
                if (event.target.value !== Role.CONSULTOR) {
                  setOwnerId("");
                }
                if (event.target.value !== Role.CONSULTOR && event.target.value !== Role.PROPRIETARIO && event.target.value !== Role.GERENTE_NEGOCIOS) {
                  setSelectedOfficeId(offices[0]?.id ?? null);
                }
              }}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              {Object.entries(roleLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          {showOfficeField && (
            <div className="space-y-1">
              <label className="text-xs text-slate-600">Escritório</label>
              <select
                value={selectedOfficeId ?? ""}
                onChange={(event) => setSelectedOfficeId(event.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <option value="">Selecione</option>
                {offices.map((officeOption) => (
                  <option key={officeOption.id} value={officeOption.id}>
                    {officeOption.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {requiresOwner && (
            <div className="space-y-1">
              <label className="text-xs text-slate-600">Proprietário</label>
              <select
                value={ownerId}
                onChange={(event) => setOwnerId(event.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <option value="">Selecione</option>
                {ownersForOffice.map((ownerOption) => (
                  <option key={ownerOption.id} value={ownerOption.id}>
                    {ownerOption.name} ({ownerOption.email})
                  </option>
                ))}
              </select>
            </div>
          )}
          {mode === "edit" && (
            <div className="space-y-1">
              <label className="text-xs text-slate-600">Status</label>
              <select
                value={active ? "ativo" : "inativo"}
                onChange={(event) => setActive(event.target.value === "ativo")}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </select>
            </div>
          )}
          {resetMessage ? <p className="text-xs text-emerald-600">{resetMessage}</p> : null}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {isSubmitting ? "Salvando..." : submitLabel}
          </button>
        </form>
        {mode === "edit" && onResetPassword ? (
          <div className="mt-4 space-y-2">
            <button
              type="button"
              onClick={handleResetPassword}
              disabled={isResetting}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:border-slate-400 hover:text-slate-900 disabled:opacity-50"
            >
              {isResetting ? "Resetando..." : "Resetar senha"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
