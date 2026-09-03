import { SUPER_ADMIN_PERMISSION, type Permission } from "./permissions";

/**
 * Papeis que o sistema garante existirem. Sao criados pela migracao inicial e
 * nao podem ser apagados pelo painel (`isSystem`), porque um banco sem `admin`
 * e um banco em que ninguem mais consegue convidar ninguem.
 *
 * Papeis extras podem ser criados em runtime; estes tres sao so o piso.
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
    description: "Gerencia usuarios, convites, papeis e concessoes de acesso.",
    permissions: [SUPER_ADMIN_PERMISSION],
  },
  {
    key: "member",
    name: "Membro",
    description: "Dono da propria timeline: cria, edita e apaga os proprios eventos.",
    permissions: [
      "event:create",
      "event:read",
      "event:update",
      "event:delete",
      "tag:create",
      "tag:read",
    ],
  },
  {
    key: "viewer",
    name: "Observador",
    description: "So le. Sem concessao explicita, enxerga apenas a propria timeline.",
    permissions: ["event:read", "tag:read"],
  },
];

export const DEFAULT_ROLE_KEY = "member";

export function systemRole(key: string): SystemRole | undefined {
  return SYSTEM_ROLES.find((role) => role.key === key);
}
