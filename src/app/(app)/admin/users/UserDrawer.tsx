"use client";

import { Office, Role } from "@prisma/client";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { isProprietario } from "@/lib/authRoles";

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
  seniorId?: string | null;
  officeIds?: Office[];
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
  currentUserRole?: Role;
  currentUserId?: string;
  currentUserOfficeRecordId?: string | null;
};

const roleLabels: Record<Role, string> = {
  MASTER: "Master",
  GERENTE_SENIOR: "Gerente Sênior",
  GERENTE_NEGOCIOS: "Gerente de Negócios",
  PROPRIETARIO: "Proprietário",
  CONSULTOR: "Consultor",
};

const ownerRoles: Role[] = [Role.CONSULTOR];

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
  currentUserRole,
  currentUserId,
  currentUserOfficeRecordId,
}: UserDrawerProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>(Role.PROPRIETARIO);
  const [password, setPassword] = useState("");
  const [selectedOfficeId, setSelectedOfficeId] = useState<string | null>(null);
  const [selectedOffices, setSelectedOffices] = useState<Office[]>([]);
  const [singleOffice, setSingleOffice] = useState<Office | "">("");
  const [ownerId, setOwnerId] = useState("");
  const [active, setActive] = useState(true);
  const [error, setError] = useState("");
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const requiresOwner = ownerRoles.includes(role);
  const isGS = role === Role.GERENTE_SENIOR;
  const isGN = role === Role.GERENTE_NEGOCIOS;
  const isSingleOffice = role === Role.PROPRIETARIO || role === Role.CONSULTOR;
  const showOffice = !isGS;
  const showMultiOffice = isGN;
  const showSingleOffice = isSingleOffice;
  const showOwnerSelect = requiresOwner && !isProprietario(currentUserRole);
  const showSenior = isGN;
  const currentUserIsOwner = isProprietario(currentUserRole);

  const availableRoles = useMemo(() => {
    if (currentUserIsOwner) {
      return [Role.CONSULTOR];
    }
    return Object.values(Role);
  }, [currentUserIsOwner]);

  const ownerOfficeCode = useMemo<Office | null>(() => {
    if (showSingleOffice && singleOffice) return singleOffice;
    const officeOfSelection = offices.find((office) => office.id === selectedOfficeId);
    return officeOfSelection ? officeOfSelection.office : null;
  }, [selectedOfficeId, singleOffice, offices, showSingleOffice]);

  const ownersForOffice = useMemo(() => {
    if (!ownerOfficeCode) return [];
    return owners.filter((owner) => owner.office === ownerOfficeCode);
  }, [owners, ownerOfficeCode]);

  const officeOptions = useMemo(() => Array.from(new Set(offices.map((office) => office.office))), [offices]);

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
    const defaultOfficeId =
      currentUserIsOwner && currentUserOfficeRecordId
        ? currentUserOfficeRecordId
        : user?.officeRecord?.id ?? offices[0]?.id ?? null;
    setSelectedOfficeId(defaultOfficeId);
    const defaultSingleOffice = offices.find((office) => office.id === defaultOfficeId)?.office ?? "";
    setSingleOffice(defaultSingleOffice);
    setSelectedOffices([]);
    setOwnerId(currentUserIsOwner ? currentUserId ?? "" : user?.owner?.id ?? "");
  }, [open, user, offices, currentUserIsOwner, currentUserOfficeRecordId, currentUserId]);

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

    if (!currentUserIsOwner && showMultiOffice && selectedOffices.length === 0) {
      setError("Selecione ao menos um escritório para o gerente de negócios.");
      return;
    }
    if (!currentUserIsOwner && showSingleOffice && !singleOffice) {
      setError("Selecione um escritório válido.");
      return;
    }

    let ownerIdToSend: string | null = null;
    if (requiresOwner) {
      ownerIdToSend = currentUserIsOwner ? currentUserId ?? "" : ownerId;
    }

    if (requiresOwner && !ownerIdToSend) {
      setError("Escolha um proprietário responsável.");
      return;
    }

    const payload: UserDrawerPayload = {
      name: name.trim(),
      email: email.trim(),
      role,
      officeIds: isGS
        ? []
        : isGN
        ? selectedOffices
        : isSingleOffice && singleOffice
        ? [singleOffice]
        : [],
      ownerId: requiresOwner ? ownerIdToSend : null,
      seniorId: showSenior
        ? currentUserRole === Role.GERENTE_SENIOR
          ? currentUserId ?? null
          : null
      : null,
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

  const officeLabel =
    offices.find((office) => office.id === (currentUserIsOwner ? currentUserOfficeRecordId : selectedOfficeId))
      ?.name ?? "";
  const ownerLabel = owners.find((owner) => owner.id === currentUserId)?.name ?? "Você mesmo";

  const heading = mode === "create" ? "Novo usuário" : "Editar usuário";
  const submitLabel = mode === "create" ? "Criar usuário" : "Salvar alterações";

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/40"
      onMouseDown={onClose}
    >
      <div
        ref={panelRef}
        className="h-full w-full max-w-md bg-white p-6 shadow-lg overflow-y-auto"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
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
              onChange={(event) => setRole(event.target.value as Role)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              {availableRoles.map((value) => (
                <option key={value} value={value}>
                  {roleLabels[value]}
                </option>
              ))}
            </select>
          </div>
          {currentUserIsOwner ? (
            <div className="space-y-1">
              <label className="text-xs text-slate-600">Escritório</label>
              <div className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
                {officeLabel || "Sem escritório"}
              </div>
            </div>
          ) : showMultiOffice ? (
            <div className="space-y-1">
              <label className="text-xs text-slate-600">Escritórios</label>
              <select
                multiple
                value={selectedOffices}
                onChange={(event) => {
                  const values = Array.from(event.target.selectedOptions).map(
                    (option) => option.value as Office
                  );
                  setSelectedOffices(values);
                }}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                {officeOptions.map((officeCode) => (
                  <option key={officeCode} value={officeCode}>
                    {officeCode}
                  </option>
                ))}
              </select>
            </div>
          ) : showSingleOffice ? (
            <div className="space-y-1">
              <label className="text-xs text-slate-600">Escritório</label>
              <select
                value={selectedOfficeId ?? ""}
                onChange={(event) => {
                  setSelectedOfficeId(event.target.value);
                  const officeOption = offices.find((office) => office.id === event.target.value);
                  setSingleOffice(officeOption?.office ?? "");
                }}
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
          ) : null}
          {showOwnerSelect ? (
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
          ) : null}
          {currentUserIsOwner && requiresOwner ? (
            <div className="space-y-1">
              <label className="text-xs text-slate-600">Proprietário</label>
              <div className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
                {ownerLabel}
              </div>
            </div>
          ) : null}
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
