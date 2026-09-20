import { AuthenticationFailedError, RateLimitedError } from "../../../common/errors";
import type { Clock } from "../../../common/clock";
import type { SecretGenerator } from "../../../common/secret-generator";
import type { RequestContext } from "../../../common/request-context";
import { SECURITY_POLICY } from "../../../config/security-policy";
import { hashSecretToken } from "../../../auth-core/security/secret-token";
import type { SignAccessToken } from "../../../auth-core/security/jwt";
import type { AuthenticationRepository } from "../postgres-login.repository";
import type { RateLimiter } from "../services/rate-limit/rate-limiter";
import { normalizeEmail, type User } from "../../../domain/users/user";
import type { UserReader } from "../../../auth-core/persistence/postgres-user.repository";
import { LoginCredentialChecker } from "../services/login-credential-checker";

export interface SessionTokensOutput {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresInSeconds: number;
  refreshTokenExpiresAt: string;
}

export interface LoginWithPasswordInput {
  email: string;
  password: string;
  context: RequestContext;
}

export class LoginWithPasswordUseCase {
  constructor(
    private readonly users: UserReader,
    private readonly credentials: LoginCredentialChecker,
    private readonly limiter: RateLimiter,
    private readonly repo: AuthenticationRepository,
    private readonly clock: Clock,
    private readonly secrets: SecretGenerator,
    private readonly limits: {
      passwordEmail: { attempts: number; windowSeconds: number };
      passwordIp: { attempts: number; windowSeconds: number };
    },
    private readonly sign: SignAccessToken,
  ) {}

  async execute(input: LoginWithPasswordInput): Promise<SessionTokensOutput> {
    const now = this.clock.now();
    const email = normalizeEmail(input.email);
    const password = input.password.normalize("NFC");
    const byEmail = await this.limiter.hit({
      scope: "password_email",
      subject: email,
      limit: this.limits.passwordEmail.attempts,
      windowSeconds: this.limits.passwordEmail.windowSeconds,
      now,
    });
    const byIp = await this.limiter.hit({
      scope: "password_ip",
      subject: input.context.ipAddress ?? "unknown",
      limit: this.limits.passwordIp.attempts,
      windowSeconds: this.limits.passwordIp.windowSeconds,
      now,
    });
    if (!byEmail.allowed || !byIp.allowed) {
      throw new RateLimitedError(Math.max(byEmail.retryAfterSeconds, byIp.retryAfterSeconds), "password login");
    }

    const user = await this.users.findByEmail(email);
    const valid = await this.credentials.check(user, password);
    if (!valid) throw new AuthenticationFailedError(user ? `login ${user.status}` : "unknown email");
    return this.completeLogin(user!, input.context, now);
  }

  private async completeLogin(user: User, context: RequestContext, now: Date): Promise<SessionTokensOutput> {
    const refreshToken = this.secrets.randomBytes(32).toString("base64url");
    const refreshTokenExpiresAt = new Date(now.getTime() + SECURITY_POLICY.refreshTokenTtlSeconds * 1000);
    const audit = (action: import("../../../audit/audit-event").AuditAction): import("../../../audit/audit-event").AuditEventInput => ({
      correlationId: context.correlationId,
      actorUserId: user.id,
      action,
      targetType: "user",
      targetId: user.id,
      result: "succeeded",
      reason: null,
      metadata: {},
      context,
      occurredAt: now,
    });
    const committed = await this.repo.completeLogin({
      userId: user.id,
      newSession: {
        id: this.secrets.randomId(),
        amr: ["pwd"],
        authTime: now,
        issuedAt: now,
        context,
        refreshToken: {
          id: this.secrets.randomId(),
          hash: hashSecretToken(refreshToken),
          expiresAt: refreshTokenExpiresAt,
        },
      },
      now,
      auditEvents: [audit("login.succeeded"), audit("session.issued")],
    }, this.sign);
    if (committed === "invalid") throw new AuthenticationFailedError("login invalid");
    return {
      accessToken: committed.accessToken,
      refreshToken,
      accessTokenExpiresInSeconds: SECURITY_POLICY.accessTokenTtlSeconds,
      refreshTokenExpiresAt: committed.refreshTokenExpiresAt.toISOString(),
    };
  }
}
