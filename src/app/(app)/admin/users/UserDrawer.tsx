"use client";

import { Office, Role } from "@prisma/client";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { isProprietario } from "@/lib/authRoles";
import { Lock, Unlock, RefreshCw, User, Plus } from "lucide-react";

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
  onDelete?: () => Promise<void>;
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
  onDelete,
  currentUserRole,

  currentUserId,
  currentUserOfficeRecordId,
}: UserDrawerProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>(Role.PROPRIETARIO);
  const [password, setPassword] = useState("");
  const [selectedOfficeId, setSelectedOfficeId] = useState<string | null>(null);
  const [selectedManagedOfficeIds, setSelectedManagedOfficeIds] = useState<string[]>([]);
  const [ownerId, setOwnerId] = useState("");
  const [active, setActive] = useState(true);
  const [error, setError] = useState("");
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const requiresOwner = ownerRoles.includes(role);
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
    if (isGN) {
      setSelectedManagedOfficeIds(user?.officeRecord?.id ? [user.officeRecord.id] : defaultOfficeId ? [defaultOfficeId] : []);
    } else {
      setSelectedManagedOfficeIds([]);
    }
    setOwnerId(currentUserIsOwner ? currentUserId ?? "" : user?.owner?.id ?? "");
  }, [open, user, offices, currentUserIsOwner, currentUserOfficeRecordId, currentUserId, availableRoles, isGN]);

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

    if ((role === Role.CONSULTOR || role === Role.PROPRIETARIO) && !selectedOfficeId) {
      setError("É necessário vincular a um escritório.");
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
      officeIds: [],
      managedOfficeIds: isGN ? selectedManagedOfficeIds : [],
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

  const handleDelete = async () => {
    if (!onDelete) return;
    if (confirm(`Tem certeza que deseja excluir o usuário ${name}? Esta ação não pode ser desfeita.`)) {
      await onDelete();
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm animate-in fade-in duration-200"
      onMouseDown={onClose}
    >
      <div
        ref={panelRef}
        className="w-full max-w-md bg-pic-dark border-2 border-neon-blue shadow-[0_0_50px_rgba(0,0,0,0.8)] relative flex flex-col max-h-[90vh] overflow-y-auto custom-scrollbar rounded-xl"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="p-6 border-b border-pic-zinc flex justify-between items-center bg-[url('/grid.svg')]">
          <h3 className="text-xl font-bold text-white uppercase tracking-wider flex items-center gap-2">
            {mode === "create" ? <Plus className="text-neon-green" /> : <User className="text-neon-blue" />}
            {heading}
          </h3>
          <button
            type="button"
            className="text-slate-400 hover:text-white transition-colors"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="p-6">

          <form className="space-y-5" onSubmit={handleSubmit}>
            {error ? <div className="p-3 bg-red-900/20 border border-red-500 text-red-400 text-sm rounded-lg">{error}</div> : null}

            <div className="grid gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Nome</label>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="w-full bg-black border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-neon-blue focus:ring-1 focus:ring-neon-blue outline-none transition-all placeholder:text-slate-600"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full bg-black border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-neon-blue focus:ring-1 focus:ring-neon-blue outline-none transition-all placeholder:text-slate-600"
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
                  className="w-full bg-black border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-neon-blue focus:ring-1 focus:ring-neon-blue outline-none transition-all placeholder:text-slate-600"
                  required
                />
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Perfil</label>
              <select
                value={role}
                onChange={(event) => setRole(event.target.value as Role)}
                className="w-full bg-black border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-neon-blue focus:ring-1 focus:ring-neon-blue outline-none transition-all"
              >
                {availableRoles.map((value) => (
                  <option key={value} value={value} className="bg-slate-900 text-white">
                    {roleLabels[value]}
                  </option>
                ))}
              </select>
            </div>

            {currentUserIsOwner ? (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Escritório</label>
                <div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 font-medium">
                  {officeLabel || "Sem escritório"}
                </div>
              </div>
            ) : showMultiOffice ? (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Escritórios</label>
                <select
                  multiple
                  value={selectedManagedOfficeIds}
                  onChange={(event) => {
                    const values = Array.from(event.target.selectedOptions).map((option) => option.value);
                    setSelectedManagedOfficeIds(values);
                    if (!selectedOfficeId && values.length) {
                      setSelectedOfficeId(values[0]);
                    }
                  }}
                  className="w-full bg-black border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-neon-blue focus:ring-1 focus:ring-neon-blue outline-none transition-all"
                >
                  {offices.map((officeOption) => (
                    <option key={officeOption.id} value={officeOption.id} className="bg-slate-900 text-white">
                      {officeOption.name} ({officeOption.code})
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
                  className="w-full bg-black border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-neon-blue focus:ring-1 focus:ring-neon-blue outline-none transition-all"
                >
                  <option value="" className="bg-slate-900">Selecione</option>
                  {offices.map((officeOption) => (
                    <option key={officeOption.id} value={officeOption.id} className="bg-slate-900 text-white">
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
                  className="w-full bg-black border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-neon-blue focus:ring-1 focus:ring-neon-blue outline-none transition-all"
                >
                  <option value="" className="bg-slate-900">Selecione</option>
                  {ownersForOffice.map((ownerOption) => (
                    <option key={ownerOption.id} value={ownerOption.id} className="bg-slate-900 text-white">
                      {ownerOption.name} ({ownerOption.email})
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-lg bg-neon-green text-black hover:bg-emerald-400 px-4 py-3 text-sm font-black uppercase tracking-wider shadow-[0_0_20px_rgba(34,197,94,0.3)] transition-all transform hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
            >
              {isSubmitting ? "Salvando..." : submitLabel}
            </button>
          </form>

          {mode === "edit" && (
            <div className="mt-8 pt-6 border-t border-slate-800 space-y-4">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Ações de Segurança</h4>

              {/* Block / Unlock */}
              <div className="flex items-center justify-between p-3 rounded-lg border border-slate-800 bg-slate-900/50">
                <div className="flex items-center gap-3">
                  {active ? <Unlock className="w-4 h-4 text-emerald-500" /> : <Lock className="w-4 h-4 text-red-500" />}
                  <div>
                    <p className="text-sm font-bold text-white">{active ? "Acesso Permitido" : "Acesso Bloqueado"}</p>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider">{active ? "O usuário pode fazer login" : "O usuário não pode acessar"}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleToggleBlock}
                  className={`px-3 py-1.5 text-xs font-bold rounded uppercase tracking-wider border ${active ? 'border-red-900 text-red-500 hover:bg-red-900/20' : 'border-emerald-900 text-emerald-500 hover:bg-emerald-900/20'}`}
                >
                  {active ? "Bloquear" : "Desbloquear"}
                </button>
              </div>

              {/* Reset Password */}
              {onResetPassword && (
                <div className="p-3 rounded-lg border border-slate-800 bg-slate-900/50">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <RefreshCw className="w-4 h-4 text-neon-blue" />
                      <div>
                        <p className="text-sm font-bold text-white">Resetar Senha</p>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider">Gera uma nova senha aleatória</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleResetPassword}
                      disabled={isResetting}
                      className="px-3 py-1.5 text-xs font-bold rounded uppercase tracking-wider border border-blue-900 text-blue-500 hover:bg-blue-900/20 disabled:opacity-50"
                    >
                      {isResetting ? "..." : "Resetar"}
                    </button>
                  </div>
                  {resetMessage && (
                    <div className="mt-2 p-2 bg-emerald-900/20 text-emerald-400 text-xs font-mono rounded text-center border border-emerald-900/50 select-all">
                      {resetMessage}
                    </div>
                  )}
                </div>

              )}

              {/* Delete User */}
              {onDelete && (
                <div className="p-3 rounded-lg border border-red-900/50 bg-red-950/20">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-red-500">Excluir Usuário</p>
                      <p className="text-[10px] text-red-400/60 uppercase tracking-wider">Ação irreversível</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleDelete}
                      className="px-3 py-1.5 text-xs font-bold rounded uppercase tracking-wider border border-red-900 text-red-500 hover:bg-red-900/20"
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
