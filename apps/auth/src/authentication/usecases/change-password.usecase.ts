import { AuthenticationFailedError } from "../../common/errors";
import type { AuditAction, AuditEventInput } from "../../audit/audit-event";
import type { Clock } from "../../common/clock";
import type { RequestContext } from "../../common/request-context";
import type { SecretGenerator } from "../../common/secret-generator";
import { SECURITY_POLICY } from "../../config/security-policy";
import type { PreparePassword } from "../../credentials/prepare-password";
import type { SignAccessToken } from "../../crypto/jwt";
import { hashSecretToken } from "../../crypto/secret-token";
import type { AuthenticationRepository } from "../../mfa/ports/authentication-repository";
import type { UserReader } from "../../users/ports/user-repository";
import type { AuthenticatedActor } from "../../users/user";

export interface ChangePasswordResult { accessToken: string; refreshToken: string; accessTokenExpiresInSeconds: number; refreshTokenExpiresAt: string }

function audit(actor: AuthenticatedActor, context: RequestContext, occurredAt: Date, action: AuditAction): AuditEventInput {
  return { correlationId: context.correlationId, actorUserId: actor.userId, action, targetType: "user", targetId: actor.userId, result: "succeeded", reason: null, metadata: {}, context, occurredAt };
}

/**
 * Troca a senha atras de um step-up de uso unico.
 *
 * Politica, HIBP e scrypt rodam **antes** da transacao. Sao os tres passos que
 * podem demorar ou falhar por causa de terceiros, e nenhum deles pode segurar
 * lock de linha. A consequencia que importa: se o HIBP estiver fora, a chamada
 * termina em 503 sem ter tocado no attempt -- o step-up continua disponivel ate
 * expirar, e o usuario nao precisa de outro OTP para tentar de novo.
 */
export class ChangePasswordUseCase {
  constructor(
    private readonly users: UserReader,
    private readonly repo: AuthenticationRepository,
    private readonly preparePassword: PreparePassword,
    private readonly clock: Clock,
    private readonly secrets: SecretGenerator,
    private readonly signAccessToken: SignAccessToken,
  ) {}

  async execute(input: { actor: AuthenticatedActor; stepUpToken: string; newPassword: string; context: RequestContext }): Promise<ChangePasswordResult> {
    const now = this.clock.now();
    const user = await this.users.findById(input.actor.userId);
    if (!user || user.status !== "active") throw new AuthenticationFailedError("password change for inactive user");

    const prepared = await this.preparePassword.execute({ password: input.newPassword, normalizedEmail: user.email, name: user.name });

    const refreshToken = this.secrets.randomBytes(32).toString("base64url");
    const refreshTokenExpiresAt = new Date(now.getTime() + SECURITY_POLICY.refreshTokenTtlSeconds * 1000);
    const committed = await this.repo.changePasswordWithStepUp({
      attemptTokenHash: hashSecretToken(input.stepUpToken), userId: user.id, originSessionId: input.actor.sessionId,
      passwordHash: prepared.passwordHash,
      newSession: {
        id: this.secrets.randomId(), amr: input.actor.amr, authTime: now, issuedAt: now, context: input.context,
        refreshToken: { id: this.secrets.randomId(), hash: hashSecretToken(refreshToken), expiresAt: refreshTokenExpiresAt },
      },
      now,
      auditEvents: [
        audit(input.actor, input.context, now, "step_up.consumed"),
        audit(input.actor, input.context, now, "password.changed"),
        audit(input.actor, input.context, now, "session.revoked_all"),
        audit(input.actor, input.context, now, "session.issued"),
      ],
    }, this.signAccessToken);
    if (committed === "invalid") throw new AuthenticationFailedError("step up not usable for password change");

    return { accessToken: committed.accessToken, refreshToken, accessTokenExpiresInSeconds: SECURITY_POLICY.accessTokenTtlSeconds, refreshTokenExpiresAt: committed.refreshTokenExpiresAt.toISOString() };
  }
}
