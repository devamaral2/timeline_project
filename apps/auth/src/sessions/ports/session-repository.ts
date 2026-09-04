import type { RequestContext } from "../../common/request-context";
import type { SignAccessToken } from "../../crypto/jwt";
import type { AuthenticatedActor, ResolvedAccess } from "../../users/user";
import type { Session } from "../session";

/**
 * Sem `auditEvents` de proposito, ao contrario de `CompleteInviteEnrollmentCommand`
 * e companhia: aqui o chamador nao tem como montar o evento certo com
 * antecedencia, porque nao sabe ainda qual vai ser o desfecho da rotacao
 * (`rotated`/`reused`/expirado) nem a que sessao o hash pertence. Quem monta
 * o `AuditEventInput` e a implementacao, depois de descobrir isso dentro da
 * propria transacao — consulte `sessionAuditEvent` em `PostgresSessionRepository`.
 */
export interface RotateRefreshTokenCommand {
  presentedTokenHash: string;
  successor: { id: string; hash: string; issuedAt: Date; expiresAt: Date };
  now: Date;
  context: RequestContext;
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
  rotateRefreshToken(command: RotateRefreshTokenCommand, sign: SignAccessToken): Promise<RotateRefreshTokenResult>;
  revokeByRefreshToken(command: RevokeByRefreshTokenCommand): Promise<boolean>;
  revokeAllOfUser(command: RevokeAllOfUserCommand): Promise<number>;
  findActiveSession(query: FindActiveSessionQuery): Promise<Session | null>;
}
