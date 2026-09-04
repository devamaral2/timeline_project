import { NotFoundError } from "../../common/errors";
import type { Clock } from "../../common/clock";
import type { RequestContext } from "../../common/request-context";
import type { AuthenticatedActor } from "../../users/user";
import type { SessionRepository } from "../ports/session-repository";

/**
 * Derruba as sessoes de outro usuario. E a acao que um admin usa quando
 * desconfia de um aparelho perdido -- o access token daquele usuario continua
 * criptograficamente valido ate expirar, mas nao consegue mais gerar sessao
 * nova, que e o limite aceito por validar o JWT localmente.
 */
export class RevokeUserSessionsUseCase {
  constructor(private readonly sessions: SessionRepository, private readonly clock: Clock) {}

  async execute(input: { actor: AuthenticatedActor; targetUserId: string; context: RequestContext }): Promise<void> {
    const outcome = await this.sessions.revokeAllOfTargetUser({
      targetUserId: input.targetUserId, actorUserId: input.actor.userId, now: this.clock.now(), context: input.context,
    });
    if (outcome === "not_found") throw new NotFoundError("unknown user");
  }
}
