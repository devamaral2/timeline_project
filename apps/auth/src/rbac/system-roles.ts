import { SUPER_ADMIN_PERMISSION, type Permission } from "./permissions";

/**
 * Papeis que o sistema garante existirem. Sao criados pela migracao inicial e
 * nao podem ser apagados pelo painel (`isSystem`), porque um banco sem `admin`
 * e um banco em que ninguem mais consegue convidar ninguem.
 *
 * Por enquanto sao os unicos dois; RBAC continua em tabela para crescer depois.
 */
export interface SystemRole {
  key: string;
  name: string;
  description: string;
  permissions: readonly Permission[];
}

export const SYSTEM_ROLES: readonly SystemRole[] = [
  {
    key: "admin",
    name: "Administrador",
    description: "Le, cria, altera e apaga tudo (*:manage).",
    permissions: [SUPER_ADMIN_PERMISSION],
  },
  {
    key: "guest",
    name: "Convidado",
    description: "So le, e so os dados do usuario indicado em users.observes_user_id.",
    permissions: ["event:read", "tag:read"],
  },
];

export function systemRole(key: string): SystemRole | undefined {
  return SYSTEM_ROLES.find((role) => role.key === key);
}
