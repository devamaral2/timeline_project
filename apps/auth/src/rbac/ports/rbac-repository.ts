import type { DirectPermission } from "../effective-permissions";
import type { Permission } from "../permissions";
export interface Role { key:string; name:string; description:string; isSystem:boolean; permissions: Permission[]; }
export interface UserAccess { roleKeys:string[]; directPermissions:DirectPermission[]; }
export interface ResolvedAccess { roleKeys:string[]; permissions:Permission[]; denies:Permission[]; }
export interface RbacRepository { listRoles():Promise<Role[]>; findRoles(keys:readonly string[]):Promise<Role[]>; accessOf(userId:string):Promise<UserAccess>; resolvedAccessOf(userId:string):Promise<ResolvedAccess>; }
