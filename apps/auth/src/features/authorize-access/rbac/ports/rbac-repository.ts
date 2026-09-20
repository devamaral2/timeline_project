import type { DirectPermission } from "../../../../domain/rbac/effective-permissions";
import type { Permission } from "../../../../domain/rbac/permissions";
import type { ResolvedAccess } from "../../../../domain/users/user";
export type { ResolvedAccess } from "../../../../domain/users/user";
export interface Role { key:string; name:string; description:string; isSystem:boolean; permissions: Permission[]; }
export interface UserAccess { roleKeys:string[]; directPermissions:DirectPermission[]; }
export interface RbacRepository { listRoles():Promise<Role[]>; findRoles(keys:readonly string[]):Promise<Role[]>; accessOf(userId:string):Promise<UserAccess>; resolvedAccessOf(userId:string):Promise<ResolvedAccess>; }
