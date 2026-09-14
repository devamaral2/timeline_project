import type { Permission } from "../rbac/permissions";
/**
 * - `active`          — pode entrar.
 * - `inactive`        — existiu e foi desligado. Nada escreve este valor ainda (TDD §10.3).
 * - `pending_sign_up` — placeholder `admin_<hash>` criado pelo link de signup.
 * - `guest`           — principal sem credencial, preso a `observesUserId`.
 */
export type UserStatus = "active" | "inactive" | "pending_sign_up" | "guest";
export interface User { id: string; email: string | null; phone: string | null; name: string; passwordHash: string | null; status: UserStatus; observesUserId: string | null; createdAt: Date; updatedAt: Date; }
export interface SigningKeyForSigning { kid: string; encryptedPrivateKey: string; }
export interface ResolvedAccess { roleKeys: string[]; permissions: Permission[]; denies: Permission[]; }
/**
 * Quem chegou pelo bearer, discriminado pelo tipo do token. So `user` tem
 * sessao: signup e guest sao principais sem sessao, e um usecase de sessao nao
 * consegue nem receber um deles, porque o tipo nao deixa.
 */
export interface UserActor { kind:"user"; userId:string; sessionId:string; tokenId:string; roles:string[]; permissions:Permission[]; denies:Permission[]; }
/** A linha `pending_sign_up` que o link de signup autoriza a completar. */
export interface SignupActor { kind:"signup"; userId:string; tokenId:string; }
/** O guest (linha propria em `users`) e o usuario que ele observa. */
export interface GuestActor { kind:"guest"; userId:string; observedUserId:string; tokenId:string; permissions:Permission[]; }
export type TokenActor = UserActor | SignupActor | GuestActor;
/** O ator das rotas de sessao: sempre um token de usuario. */
export type AuthenticatedActor = UserActor;
export function normalizeEmail(email: string): string { return email.trim().toLowerCase(); }
export function canSignIn(user: Pick<User, "status">): boolean { return user.status === "active"; }
