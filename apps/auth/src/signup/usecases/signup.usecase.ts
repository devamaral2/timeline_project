import type { Clock } from "../../common/clock";
import { AuthenticationFailedError, ConflictError, RateLimitedError } from "../../common/errors";
import type { RequestContext } from "../../common/request-context";
import type { SecretGenerator } from "../../common/secret-generator";
import { SECURITY_POLICY } from "../../config/security-policy";
import type { PreparePassword } from "../../credentials/prepare-password";
import type { SignAccessToken } from "../../crypto/jwt";
import { hashSecretToken } from "../../crypto/secret-token";
import type { RateLimiter } from "../../rate-limit/rate-limiter";
import { normalizeEmail, type SignupActor } from "../../users/user";
import type { SignupRepository } from "../ports/signup-repository";

export interface SignupInput {
  actor: SignupActor;
  /** Ja normalizado para E.164 pelo controller. */
  phone: string;
  email: string;
  name: string;
  password: string;
  context: RequestContext;
}
export interface SignupOutput { userId: string; accessToken: string; refreshToken: string; accessTokenExpiresInSeconds: number; refreshTokenExpiresAt: string }

/**
 * Flow 1, passo 2 (TDD §6.1). O token de signup ja foi verificado pelo guard
 * (tipo, assinatura, validade); aqui ficam o throttle, a politica de senha sobre
 * os valores **enviados** e a transacao que consome o link e ativa a conta.
 *
 * O throttle vem antes do scrypt: signup e um POST que faz um hash caro por
 * requisicao, e sem limite vira alvo facil de exaustao de CPU.
 */
export class SignupUseCase {
  constructor(
    private readonly signups: SignupRepository,
    private readonly preparePassword: PreparePassword,
    private readonly limiter: RateLimiter,
    private readonly sign: SignAccessToken,
    private readonly clock: Clock,
    private readonly secrets: SecretGenerator,
    private readonly limit: { attempts: number; windowSeconds: number },
  ) {}

  async execute(input: SignupInput): Promise<SignupOutput> {
    const now = this.clock.now();
    const limited = await this.limiter.hit({ scope: "signup_ip", subject: input.context.ipAddress ?? "unknown", limit: this.limit.attempts, windowSeconds: this.limit.windowSeconds, now });
    if (!limited.allowed) throw new RateLimitedError(limited.retryAfterSeconds, "signup");

    const email = normalizeEmail(input.email);
    const name = input.name.trim();
    const prepared = await this.preparePassword.execute({ password: input.password, normalizedEmail: email, name });

    const refreshToken = this.secrets.randomBytes(32).toString("base64url");
    const outcome = await this.signups.completeSignup({
      userId: input.actor.userId,
      tokenJti: input.actor.tokenId,
      email,
      phone: input.phone,
      name,
      passwordHash: prepared.passwordHash,
      session: {
        id: this.secrets.randomId(),
        refreshToken: { id: this.secrets.randomId(), hash: hashSecretToken(refreshToken), expiresAt: new Date(now.getTime() + SECURITY_POLICY.refreshTokenTtlSeconds * 1000) },
      },
      now,
      context: input.context,
    }, this.sign);

    // Quem chega aqui tem um link valido, entao dizer que o email ja existe nao
    // abre uma consulta de contas para anonimos.
    if (outcome.kind === "email_taken") throw new ConflictError("email_already_exists");
    if (outcome.kind === "phone_taken") throw new ConflictError("phone_already_exists");
    if (outcome.kind === "invalid") throw new AuthenticationFailedError("signup token consumed, revoked, expired or account not pending");

    return {
      userId: input.actor.userId,
      accessToken: outcome.session.accessToken,
      refreshToken,
      accessTokenExpiresInSeconds: SECURITY_POLICY.accessTokenTtlSeconds,
      refreshTokenExpiresAt: outcome.session.refreshTokenExpiresAt.toISOString(),
    };
  }
}
