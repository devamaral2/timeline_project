import type { MfaChannel } from "../mfa/mfa-challenge";
import type { Permission } from "../rbac/permissions";
import type { RequestContext } from "../common/request-context";
export type UserStatus = "pending_invite" | "active" | "suspended" | "disabled";
export interface User { id: string; email: string; name: string; passwordHash: string | null; phoneE164: string | null; phoneVerifiedAt: Date | null; mfaChannel: MfaChannel | null; status: UserStatus; createdAt: Date; updatedAt: Date; }
export type AuthenticationMethod = "pwd" | "otp" | "recovery";
export interface SigningKeyForSigning { kid: string; encryptedPrivateKey: string; }
export interface ResolvedAccess { roleKeys: string[]; permissions: Permission[]; denies: Permission[]; }
export interface AuthenticatedActor { userId:string; sessionId:string; roles:string[]; permissions:Permission[]; denies:Permission[]; amr:AuthenticationMethod[]; authTime:number; }
export interface NewSessionWrite { id:string; amr:readonly AuthenticationMethod[]; authTime:Date; issuedAt:Date; context:RequestContext; refreshToken:{id:string;hash:string;expiresAt:Date}; }
export function normalizeEmail(email: string): string { return email.trim().toLowerCase(); }
export function canSignIn(user: Pick<User, "status">): boolean { return user.status === "active"; }
