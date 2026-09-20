import type { AuthTransaction } from "../../../db/client";
import type { DirectPermission } from "../../../domain/rbac/effective-permissions";
import type { Permission } from "../../../domain/rbac/permissions";
import type { ResolvedAccess } from "./ports/rbac-repository";
import { resolveUserPermissions } from "../../../domain/rbac/resolve-user-permissions";

/**
 * A mesma resolucao de RBAC que `PostgresRbacRepository.resolvedAccessOf` faz,
 * porem dentro de uma transacao ja aberta -- o repositorio de RBAC so aceita
 * `AuthDatabase`, entao nao da para reusa-lo de dentro de um commit.
 *
 * Existe para que toda escrita que assina um token, ou que precisa saber quem
 * ainda e admin, leia as permissoes de agora e sob os mesmos locks.
 */
export async function resolveAccessInTransaction(tx: AuthTransaction, userId: string): Promise<ResolvedAccess> {
  const roleKeys = (await tx.query<{ role_key: string }>("SELECT role_key FROM user_roles WHERE user_id = $1 ORDER BY role_key", [userId])).rows.map((row) => row.role_key);
  const rolePermissions = roleKeys.length
    ? (await tx.query<{ permission: Permission }>("SELECT DISTINCT permission FROM role_permissions WHERE role_key = ANY($1)", [roleKeys])).rows.map((row) => row.permission)
    : [];
  const directPermissions = (await tx.query<DirectPermission>("SELECT permission, effect FROM user_permissions WHERE user_id = $1 ORDER BY permission", [userId])).rows;
  return resolveUserPermissions(roleKeys, { rolePermissions, directPermissions });
}
