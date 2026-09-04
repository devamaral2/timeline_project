import type { Clock } from "../../common/clock";
import type { RequestContext } from "../../common/request-context";
import type { AuthenticatedActor } from "../../users/user";
import type { SessionRepository } from "../ports/session-repository";

/**
 * O actor vem de um bearer ainda criptograficamente valido, mas o repositorio
 * relê usuario e sessao dentro da propria transacao de revogacao — se a
 * origem do token ja foi desativada, a mutacao nao acontece.
 */
export class LogoutAllUseCase {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: { actor: AuthenticatedActor; context: RequestContext }): Promise<void> {
    await this.sessions.revokeAllOfUser({
      actor: input.actor,
      now: this.clock.now(),
      context: input.context,
    });
  }
}
