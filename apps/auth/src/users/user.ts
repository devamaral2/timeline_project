/**
 * O usuario do sistema.
 *
 * Nao ha auto-cadastro: um usuario nasce em `pending_invite`, criado por um
 * admin junto com todo o RBAC dele, e so vira `active` quando aceita o convite.
 * Por isso `passwordHash` e `phoneE164` sao nulos no comeco — sao preenchidos no
 * aceite, nao na criacao.
 */
export type UserStatus = "pending_invite" | "active" | "suspended" | "disabled";

export type MfaChannel = "sms" | "whatsapp";
export type SecondFactor = "otp" | "recovery";
export type AuthenticationPurpose =
  | "invite_acceptance"
  | "login"
  | "password_change"
  | "recovery_regeneration";
export type AuthenticationMethod = "pwd" | "otp" | "recovery";

export interface ResolvedAccess {
  roleKeys: string[];
  permissions: Permission[];
  denies: Permission[];
}

export interface AuthenticatedActor {
  userId: string;
  sessionId: string;
  roles: string[];
  permissions: Permission[];
  denies: Permission[];
  amr: AuthenticationMethod[];
  authTime: number;
}

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresInSeconds: 900;
  refreshTokenExpiresAt: Date;
}

export interface NewSessionWrite {
  id: string;
  amr: readonly AuthenticationMethod[];
  authTime: Date;
  issuedAt: Date;
  context: RequestContext;
  refreshToken: {
    id: string;
    hash: string;
    expiresAt: Date;
  };
}

export interface NewRecoveryCode {
  id: string;
  hash: string;
  generation: number;
}

export interface SessionCommit {
  userId: string;
  sessionId: string;
  accessToken: string;
  refreshTokenExpiresAt: Date;
  access: ResolvedAccess;
}

export interface SigningKeyForSigning {
  kid: string;
  encryptedPrivateKey: string;
}

export interface User {
  id: string;
  /** Sempre normalizado. */
  email: string;
  name: string;
  /** E.164 (+5511999998888). Destino do codigo de 2FA. */
  phoneE164: string | null;
  phoneVerifiedAt: Date | null;
  passwordHash: string;
  status: UserStatus;
  mfaChannel: MfaChannel;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
}

/**
 * Minusculas e sem espaco nas pontas. Sem truques de "gmail ignora ponto": duas
 * grafias diferentes do mesmo endereco tem que continuar sendo duas linhas
 * diferentes, senao o convite de um vira o login de outro.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** So `active` entra. `pending_invite` ainda nao aceitou o convite. */
export function canSignIn(user: Pick<User, "status">): boolean {
  return user.status === "active";
}
import type { RequestContext } from "../common/request-context";
import type { Permission } from "../rbac/permissions";
