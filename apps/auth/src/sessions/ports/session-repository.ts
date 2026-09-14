import type { RequestContext } from "../../common/request-context";
import type { SignAccessToken } from "../../crypto/jwt";
import type { AuthenticatedActor, ResolvedAccess } from "../../users/user";
import type { Session } from "../session";

export interface RotateRefreshTokenCommand {
  presentedTokenHash: string;
  successor: { id: string; hash: string; issuedAt: Date; expiresAt: Date };
  now: Date;
  context: RequestContext;
}

/** Abre uma sessao de senha para um usuario ja autenticado pelo chamador. */
export interface OpenSessionCommand {
  userId: string;
  sessionId: string;
  refreshToken: { id: string; hash: string; expiresAt: Date };
  now: Date;
  context: RequestContext;
}

export interface OpenedSession {
  sessionId: string;
  accessToken: string;
  access: ResolvedAccess;
  refreshTokenExpiresAt: Date;
}

export interface RevokeByRefreshTokenCommand {
  presentedTokenHash: string;
  now: Date;
  context: RequestContext;
}

export interface RevokeAllOfUserCommand {
  actor: AuthenticatedActor;
  now: Date;
  context: RequestContext;
}

export interface RevokeAllOfTargetUserCommand {
  targetUserId: string;
  actorUserId: string;
  now: Date;
  context: RequestContext;
}

export interface FindActiveSessionQuery {
  sessionId: string;
  userId: string;
}

export type RotateRefreshTokenResult =
  | { kind: "rotated"; accessToken: string; session: Session; access: ResolvedAccess; refreshTokenExpiresAt: Date }
  | { kind: "reused" }
  | { kind: "invalid" };

/**
 * `revokeAllOfUser` releva usuario e sessao do proprio ator dentro da mesma
 * transacao que revoga — um access token ainda valido criptograficamente nao
 * consegue agir se a sua sessao de origem ja foi revogada. Por isso o metodo
 * pode rejeitar com `AuthenticationFailedError`, e nao so devolver a contagem.
 */
export interface SessionRepository {
  /** `invalid` quando o usuario ja nao esta `active` no instante do commit. */
  openSession(command: OpenSessionCommand, sign: SignAccessToken): Promise<OpenedSession | "invalid">;
  rotateRefreshToken(command: RotateRefreshTokenCommand, sign: SignAccessToken): Promise<RotateRefreshTokenResult>;
  revokeByRefreshToken(command: RevokeByRefreshTokenCommand): Promise<boolean>;
  revokeAllOfUser(command: RevokeAllOfUserCommand): Promise<number>;
  /** Revogacao administrativa: quem age e o admin, quem perde a sessao e outro. */
  revokeAllOfTargetUser(command: RevokeAllOfTargetUserCommand): Promise<number | "not_found">;
  findActiveSession(query: FindActiveSessionQuery): Promise<Session | null>;
}
