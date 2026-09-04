import { NotFoundError } from "../../common/errors";
import type { Clock } from "../../common/clock";
import type { RequestContext } from "../../common/request-context";
import type { AuthenticatedActor } from "../../users/user";
import type { InviteRepository } from "../ports/invite-repository";

/**
 * Mata o link em aberto sem criar outro. A invalidacao e a mesma da reemissao:
 * convite e aceite em andamento caem juntos, senao alguem no meio do formulario
 * ainda conseguiria concluir com o link revogado.
 */
export class RevokeInviteUseCase {
  constructor(private readonly invites: InviteRepository, private readonly clock: Clock) {}

  async execute(input: { actor: AuthenticatedActor; targetUserId: string; context: RequestContext }): Promise<void> {
    const now = this.clock.now();
    const outcome = await this.invites.revokeInvite({
      targetUserId: input.targetUserId, actorUserId: input.actor.userId, now,
      auditEvents: [{
        correlationId: input.context.correlationId, actorUserId: input.actor.userId, action: "invite.revoked",
        targetType: "user", targetId: input.targetUserId, result: "succeeded", reason: null, metadata: {},
        context: input.context, occurredAt: now,
      }],
    });
    if (outcome === "not_found") throw new NotFoundError("unknown user");
  }
}
