import type { Clock } from "../../common/clock";
import { AccessDeniedError, ConflictError, NotFoundError, RateLimitedError } from "../../common/errors";
import type { SecretGenerator } from "../../common/secret-generator";
import type { MintToken } from "../../crypto/jwt";
import type { RateLimiter } from "../../rate-limit/rate-limiter";
import type { UserActor } from "../../users/user";
import type { GuestRepository } from "../ports/guest-repository";

export interface GuestLinkOutput { guestId: string; url: string; expiresAt: string }

/** O link do guest. Como no signup, o token vai no fragmento. */
export function guestLink(webAppUrl: URL, token: string): string {
  const url = new URL("/guest", webAppUrl);
  url.hash = new URLSearchParams({ token }).toString();
  return url.toString();
}

/**
 * Flow 3 (TDD §6.3). Um link de uma hora, so leitura, sobre os dados de um
 * usuario. Sem sessao e sem refresh token: passada a hora, so um link novo.
 */
export class IssueGuestLinkUseCase {
  constructor(
    private readonly guests: GuestRepository,
    private readonly mint: MintToken,
    private readonly limiter: RateLimiter,
    private readonly clock: Clock,
    private readonly secrets: SecretGenerator,
    private readonly config: { issuer: string; audience: string; webAppUrl: URL; limit: { attempts: number; windowSeconds: number } },
  ) {}

  async execute(input: { actor: UserActor; subjectUserId: string }): Promise<GuestLinkOutput> {
    const now = this.clock.now();
    const limited = await this.limiter.hit({ scope: "guest_issuer", subject: input.actor.userId, limit: this.config.limit.attempts, windowSeconds: this.config.limit.windowSeconds, now });
    if (!limited.allowed) throw new RateLimitedError(limited.retryAfterSeconds, "guest issuance");

    const outcome = await this.guests.issueGuest({
      issuerUserId: input.actor.userId,
      issuerSessionId: input.actor.sessionId,
      subjectUserId: input.subjectUserId,
      guestId: this.secrets.randomId(),
      guestName: `guest_${this.secrets.randomBytes(4).toString("hex")}`,
      now,
      issuer: this.config.issuer,
      audience: this.config.audience,
    }, this.mint);

    if (outcome.kind === "issuer_not_admin") throw new AccessDeniedError("issuer is no longer an active super admin");
    if (outcome.kind === "subject_not_found") throw new NotFoundError(`no user ${input.subjectUserId}`);
    if (outcome.kind === "subject_not_eligible") throw new ConflictError("subject_not_eligible");
    return { guestId: outcome.guestId, url: guestLink(this.config.webAppUrl, outcome.token), expiresAt: outcome.expiresAt.toISOString() };
  }
}
