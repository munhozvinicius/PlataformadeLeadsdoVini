import { Role } from "@prisma/client";

export enum AppRole {
  MASTER = "MASTER",
  GERENTE_SENIOR = "GERENTE_SENIOR",
  GERENTE_NEGOCIOS = "GERENTE_NEGOCIOS",
  GERENTE_CONTAS = "GERENTE_CONTAS",
  PROPRIETARIO = "PROPRIETARIO",
  CONSULTOR = "CONSULTOR",
}

export const roleHierarchy: AppRole[] = [
  AppRole.MASTER,
  AppRole.GERENTE_SENIOR,
  AppRole.GERENTE_NEGOCIOS,
  AppRole.GERENTE_CONTAS,
  AppRole.PROPRIETARIO,
  AppRole.CONSULTOR,
];

type RoleLike = Role | AppRole | undefined;

const toRoleString = (role?: RoleLike) => (role as string | undefined) ?? undefined;

export function isMaster(role?: RoleLike) {
  return toRoleString(role) === AppRole.MASTER;
}

export function isGerenteSenior(role?: RoleLike) {
  return toRoleString(role) === AppRole.GERENTE_SENIOR;
}

export function isGerenteNegocios(role?: RoleLike) {
  return toRoleString(role) === AppRole.GERENTE_NEGOCIOS;
}

export function isGerenteContas(role?: RoleLike) {
  return toRoleString(role) === AppRole.GERENTE_CONTAS;
}

export function isProprietario(role?: RoleLike) {
  return toRoleString(role) === AppRole.PROPRIETARIO;
}

export function isConsultor(role?: RoleLike) {
  return toRoleString(role) === AppRole.CONSULTOR;
}

export function isOfficeAdmin(role?: RoleLike) {
  return isProprietario(role) || isGerenteSenior(role) || isGerenteNegocios(role);
}

export function canAccessAdmin(role?: RoleLike) {
  return isMaster(role) || isOfficeAdmin(role);
}

export function canAccessBoard(role?: RoleLike) {
  return isConsultor(role) || canAccessAdmin(role);
}

export function canManageUsers(role?: RoleLike) {
  return canAccessAdmin(role);
}
