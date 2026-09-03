import { allPermissions, SUPER_ADMIN_PERMISSION, type Permission } from "./permissions";
import { isAllowed, resolveEffectivePermissions, type EffectivePermissions } from "./effective-permissions";
import type { ResolvedAccess } from "./ports/rbac-repository";
export function resolveUserPermissions(roleKeys: readonly string[], access: { rolePermissions: readonly Permission[]; directPermissions: readonly import("./effective-permissions").DirectPermission[] }): ResolvedAccess { return { roleKeys: [...new Set(roleKeys)].sort(), ...resolveEffectivePermissions(access) }; }
export function coversSuperAdmin(access: ResolvedAccess | EffectivePermissions): boolean { return access.permissions.includes(SUPER_ADMIN_PERMISSION) && allPermissions().every((p) => { const [resource, action] = p.split(":") as [import("./permissions").Resource, import("./permissions").Action]; return isAllowed(access, resource, action); }); }
