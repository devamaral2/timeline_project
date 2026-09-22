import {
  permissionSetCovers,
  type Action,
  type Permission,
  type Resource,
  isPermission,
} from "./permissions";

/**
 * Uma permissao anexada direto ao usuario, fora dos papeis. `deny` existe para
 * o caso "esse usuario tem o papel de membro, menos apagar" — sem ele a saida
 * seria clonar o papel inteiro so para tirar uma linha.
 */
export interface DirectPermission {
  permission: Permission;
  effect: "allow" | "deny";
}

export interface PermissionSources {
  rolePermissions: readonly Permission[];
  directPermissions: readonly DirectPermission[];
}

/**
 * Resolve o conjunto efetivo. **Deny explicito ganha de qualquer allow**, venha
 * ele de papel ou de concessao direta — inclusive do curinga de admin. E a
 * ordem que qualquer pessoa espera ao ler "negado" numa tela.
 *
 * O resultado e ordenado para que o mesmo usuario gere sempre o mesmo JWT byte
 * a byte: torna o token comparavel em log e em teste.
 */
export interface EffectivePermissions {
  permissions: Permission[];
  denies: Permission[];
}

export function resolveEffectivePermissions(sources: PermissionSources): EffectivePermissions {
  const denies = [...new Set(
    sources.directPermissions
      .filter(({ effect }) => effect === "deny")
      .map(({ permission }) => permission)
      .filter(isPermission),
  )].sort();
  const permissions = [...new Set([
    ...sources.rolePermissions.filter(isPermission),
    ...sources.directPermissions
      .filter(({ effect }) => effect === "allow")
      .map(({ permission }) => permission)
      .filter(isPermission),
  ])].sort();
  return { permissions, denies };
}

export function isAllowed(
  access: EffectivePermissions,
  resource: Resource,
  action: Action,
): boolean {
  if (permissionSetCovers(access.denies, resource, action)) return false;
  return permissionSetCovers(access.permissions, resource, action);
}
