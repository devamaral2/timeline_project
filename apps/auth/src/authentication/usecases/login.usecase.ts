import type { Clock } from "../../common/clock";
import { AuthenticationFailedError, RateLimitedError } from "../../common/errors";
import type { RequestContext } from "../../common/request-context";
import type { SecretGenerator } from "../../common/secret-generator";
import { SECURITY_POLICY } from "../../config/security-policy";
import type { SignAccessToken } from "../../crypto/jwt";
import { hashSecretToken } from "../../crypto/secret-token";
import type { RateLimiter } from "../../rate-limit/rate-limiter";
import type { SessionRepository } from "../../sessions/ports/session-repository";
import type { UserReader } from "../../users/ports/user-repository";
import { normalizeEmail } from "../../users/user";
import type { LoginCredentialChecker } from "../login-credential-checker";

export interface LoginInput { email: string; password: string; context: RequestContext }
export interface LoginOutput { accessToken: string; refreshToken: string; accessTokenExpiresInSeconds: number; refreshTokenExpiresAt: string }
export interface LoginLimits {
  passwordEmail: { attempts: number; windowSeconds: number };
  passwordIp: { attempts: number; windowSeconds: number };
}

/**
 * Email e senha em uma ida, par de tokens na volta. Sem desafio, sem MFA.
 *
 * Tres garantias:
 * - **Uma falha so.** Email inexistente, senha errada e conta que nao pode
 *   entrar (`pending_sign_up`, `guest`, `inactive`) viram o mesmo
 *   `AuthenticationFailedError`; o motivo real fica so no log.
 * - **Mesmo custo.** `LoginCredentialChecker` roda exatamente um scrypt em todo
 *   caminho, contra o hash de mentira quando nao ha hash utilizavel, para que o
 *   tempo do 401 nao diga quais emails existem.
 * - **Throttle antes do scrypt.** Os dois contadores (email e IP) sao
 *   consumidos antes de qualquer leitura ou hash, entao um ataque de forca
 *   bruta nao compra CPU do servidor alem do limite.
 */
export class LoginUseCase {
  constructor(
    private readonly users: UserReader,
    private readonly credentials: LoginCredentialChecker,
    private readonly limiter: RateLimiter,
    private readonly sessions: SessionRepository,
    private readonly sign: SignAccessToken,
    private readonly clock: Clock,
    private readonly secrets: SecretGenerator,
    private readonly limits: LoginLimits,
  ) {}

  async execute(input: LoginInput): Promise<LoginOutput> {
    const now = this.clock.now();
    const email = normalizeEmail(input.email);
    const [byEmail, byIp] = await Promise.all([
      this.limiter.hit({ scope: "password_email", subject: email, limit: this.limits.passwordEmail.attempts, windowSeconds: this.limits.passwordEmail.windowSeconds, now }),
      this.limiter.hit({ scope: "password_ip", subject: input.context.ipAddress ?? "unknown", limit: this.limits.passwordIp.attempts, windowSeconds: this.limits.passwordIp.windowSeconds, now }),
    ]);
    if (!byEmail.allowed || !byIp.allowed) throw new RateLimitedError(Math.max(byEmail.retryAfterSeconds, byIp.retryAfterSeconds), "login");

    const user = await this.users.findByEmail(email);
    const valid = await this.credentials.check(user, input.password);
    if (!user || !valid) throw new AuthenticationFailedError(user ? `login refused for ${user.status} account` : "unknown email");

    const refreshToken = this.secrets.randomBytes(32).toString("base64url");
    const opened = await this.sessions.openSession({
      userId: user.id,
      sessionId: this.secrets.randomId(),
      refreshToken: {
        id: this.secrets.randomId(),
        hash: hashSecretToken(refreshToken),
        expiresAt: new Date(now.getTime() + SECURITY_POLICY.refreshTokenTtlSeconds * 1000),
      },
      now,
      context: input.context,
    }, this.sign);
    if (opened === "invalid") throw new AuthenticationFailedError("account left active during login");

    return {
      accessToken: opened.accessToken,
      refreshToken,
      accessTokenExpiresInSeconds: SECURITY_POLICY.accessTokenTtlSeconds,
      refreshTokenExpiresAt: opened.refreshTokenExpiresAt.toISOString(),
    };
  }
}
