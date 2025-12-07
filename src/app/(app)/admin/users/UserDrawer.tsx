"use client";

import { Office, Role } from "@prisma/client";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { isProprietario } from "@/lib/authRoles";
import { Lock, Unlock, RefreshCw } from "lucide-react";

export type OwnerOption = {
  id: string;
  name: string;
  email: string;
  officeRecordId?: string | null;
};

export type OfficeOption = {
  id: string;
  name: string;
  code: string;
};

const mapOfficeCodeToEnum = (code?: string): Office | null => {
  if (!code) return null;
  const normalized = code.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  const values = Object.values(Office) as string[];
  return values.includes(normalized) ? (normalized as Office) : null;
};

export type DrawerMode = "create" | "edit";

export type UserDrawerPayload = {
  name: string;
  email: string;
  role: Role;
  officeRecordId?: string | null;
  ownerId?: string | null;
  password?: string;
  active?: boolean;
  seniorId?: string | null;
  officeIds?: Office[];
  managedOfficeIds?: string[];
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
  const showMultiOffice = isGN;
  const showSingleOffice = isSingleOffice;
  const showOwnerSelect = requiresOwner && !isProprietario(currentUserRole);
  const showSenior = isGN;
  const currentUserIsOwner = isProprietario(currentUserRole);

  const availableRoles = useMemo(() => {
    if (currentUserIsOwner) {
      return [Role.CONSULTOR];
    }
    if (currentUserRole === Role.GERENTE_NEGOCIOS) {
      // GN pode criar Proprietário, Consultor (para seus escritórios)
      // E talvez escritório? Não aqui, isso é gestão de usuário.
      // O GN cria usuários para vincular aos seus escritórios.
      return [Role.PROPRIETARIO, Role.CONSULTOR];
    }
    return Object.values(Role);
  }, [currentUserIsOwner, currentUserRole]);

  const ownersForOffice = useMemo(() => {
    if (!selectedOfficeId) return [];
    return owners.filter((owner) => owner.officeRecordId === selectedOfficeId);
  }, [owners, selectedOfficeId]);

  const officeOptions = useMemo(() => {
    const list = offices
      .map((office) => mapOfficeCodeToEnum(office.code))
      .filter((code): code is Office => Boolean(code));
    return Array.from(new Set(list));
  }, [offices]);

  useEffect(() => {
    if (!open) {
      setError("");
      setResetMessage(null);
      return;
    }

    setName(user?.name ?? "");
    setEmail(user?.email ?? "");
    setRole(user?.role ?? (availableRoles[0] as Role));
    setActive(user?.active ?? true);
    setPassword("");
    setError("");
    setResetMessage(null);
    const defaultOfficeId =
      currentUserIsOwner && currentUserOfficeRecordId
        ? currentUserOfficeRecordId
        : user?.officeRecord?.id ?? offices[0]?.id ?? null;
    setSelectedOfficeId(defaultOfficeId);
    const defaultOfficeCode = offices.find((office) => office.id === defaultOfficeId)?.code;
    setSingleOffice(mapOfficeCodeToEnum(defaultOfficeCode) ?? "");
    setSelectedOffices([]);
    setOwnerId(currentUserIsOwner ? currentUserId ?? "" : user?.owner?.id ?? "");
  }, [open, user, offices, currentUserIsOwner, currentUserOfficeRecordId, currentUserId, availableRoles]);

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

    if (role === Role.CONSULTOR && !selectedOfficeId) {
      setError("Consultor precisa ter um escritório.");
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
      officeRecordId: selectedOfficeId,
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
        setResetMessage(`NOVA SENHA: ${newPass}`);
      }
    } catch (resetError) {
      setError((resetError as Error)?.message ?? "Erro ao resetar a senha.");
    } finally {
      setIsResetting(false);
    }
  };

  const handleToggleBlock = () => {
    setActive(!active);
  };

  const officeLabel =
    offices.find((office) => office.id === (currentUserIsOwner ? currentUserOfficeRecordId : selectedOfficeId))
      ?.name ?? "";

  const heading = mode === "create" ? "Novo usuário" : "Editar usuário";
  const submitLabel = mode === "create" ? "Criar usuário" : "Salvar alterações";

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/60 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <div
        ref={panelRef}
        className="h-full w-full max-w-md bg-white p-6 shadow-2xl overflow-y-auto border-l border-slate-200"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6 border-b border-slate-100 pb-4">
          <h3 className="text-xl font-bold text-slate-900">{heading}</h3>
          <button
            type="button"
            className="text-slate-400 hover:text-slate-900 transition-colors"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          {error ? <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div> : null}

          <div className="grid gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Nome</label>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-neon-blue focus:ring-1 focus:ring-neon-blue outline-none transition-all"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Email</label>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-neon-blue focus:ring-1 focus:ring-neon-blue outline-none transition-all"
                required
              />
            </div>
          </div>

          {mode === "create" && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Senha Inicial</label>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-neon-blue focus:ring-1 focus:ring-neon-blue outline-none transition-all"
                required
              />
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Perfil</label>
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as Role)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-neon-blue focus:ring-1 focus:ring-neon-blue outline-none transition-all"
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
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Escritório</label>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 font-medium">
                {officeLabel || "Sem escritório"}
              </div>
            </div>
          ) : showMultiOffice ? (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Escritórios</label>
              <select
                multiple
                value={selectedOffices}
                onChange={(event) => {
                  const values = Array.from(event.target.selectedOptions).map(
                    (option) => option.value as Office
                  );
                  setSelectedOffices(values);
                }}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-neon-blue focus:ring-1 focus:ring-neon-blue outline-none transition-all"
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
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Escritório</label>
              <select
                value={selectedOfficeId ?? ""}
                onChange={(event) => {
                  setSelectedOfficeId(event.target.value);
                  const officeOption = offices.find((office) => office.id === event.target.value);
                  setSingleOffice(mapOfficeCodeToEnum(officeOption?.code) ?? "");
                }}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-neon-blue focus:ring-1 focus:ring-neon-blue outline-none transition-all"
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
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Proprietário</label>
              <select
                value={ownerId}
                onChange={(event) => setOwnerId(event.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-neon-blue focus:ring-1 focus:ring-neon-blue outline-none transition-all"
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

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white px-4 py-3 text-sm font-bold uppercase tracking-wider shadow-lg shadow-emerald-500/20 transition-all transform hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
          >
            {isSubmitting ? "Salvando..." : submitLabel}
          </button>
        </form>

        {mode === "edit" && (
          <div className="mt-8 pt-6 border-t border-slate-100 space-y-4">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Ações de Segurança</h4>

            {/* Block / Unlock */}
            <div className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-slate-50">
              <div className="flex items-center gap-3">
                {active ? <Unlock className="w-4 h-4 text-emerald-500" /> : <Lock className="w-4 h-4 text-red-500" />}
                <div>
                  <p className="text-sm font-medium text-slate-900">{active ? "Acesso Permitido" : "Acesso Bloqueado"}</p>
                  <p className="text-xs text-slate-500">{active ? "O usuário pode fazer login" : "O usuário não pode acessar"}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleToggleBlock}
                className={`px-3 py-1.5 text-xs font-bold rounded border ${active ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'}`}
              >
                {active ? "Bloquear" : "Desbloquear"}
              </button>
            </div>

            {/* Reset Password */}
            {onResetPassword && (
              <div className="p-3 rounded-lg border border-slate-200 bg-slate-50">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <RefreshCw className="w-4 h-4 text-blue-500" />
                    <div>
                      <p className="text-sm font-medium text-slate-900">Resetar Senha</p>
                      <p className="text-xs text-slate-500">Gera uma nova senha aleatória</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleResetPassword}
                    disabled={isResetting}
                    className="px-3 py-1.5 text-xs font-bold rounded border border-blue-200 text-blue-600 hover:bg-blue-50 disabled:opacity-50"
                  >
                    {isResetting ? "..." : "Resetar"}
                  </button>
                </div>
                {resetMessage && (
                  <div className="mt-2 p-2 bg-emerald-100 text-emerald-800 text-xs font-mono rounded text-center border border-emerald-200 select-all">
                    {resetMessage}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
