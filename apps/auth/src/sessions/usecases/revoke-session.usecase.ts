import type { Clock } from "../../common/clock";
import type { RequestContext } from "../../common/request-context";
import { hashSecretToken } from "../../crypto/secret-token";
import type { SessionRepository } from "../ports/session-repository";

/**
 * Logout por refresh token, sem exigir bearer. Sempre resolve — nunca lanca —
 * para que o controller devolva 204 tanto na primeira revogacao quanto nas
 * repeticoes, e tambem para um token desconhecido ou malformado: a resposta
 * nao pode revelar se a sessao ja estava revogada ou nunca existiu.
 */
export class RevokeSessionUseCase {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: { refreshToken: string; context: RequestContext }): Promise<void> {
    await this.sessions.revokeByRefreshToken({
      presentedTokenHash: hashSecretToken(input.refreshToken),
      now: this.clock.now(),
      context: input.context,
    });
  }
}
