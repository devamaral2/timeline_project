import { ConflictError, NotFoundError } from "../../common/errors";
import type { Clock } from "../../common/clock";
import type { RequestContext } from "../../common/request-context";
import type { AuthenticatedActor, UserStatus } from "../user";
import type { UserRepository } from "../ports/user-repository";

export interface ChangeUserStatusResult { userId: string; status: UserStatus }

/**
 * Suspende, reativa ou desativa um usuario.
 *
 * A transacao do repositorio e quem garante a invariante: se a mudanca deixaria
 * o sistema sem nenhum administrador capaz, ela volta atras e responde
 * `would_remove_last_admin`. Aqui so traduzimos o desfecho.
 */
export class ChangeUserStatusUseCase {
  constructor(private readonly users: UserRepository, private readonly clock: Clock) {}

  async execute(input: { actor: AuthenticatedActor; targetUserId: string; status: UserStatus; context: RequestContext }): Promise<ChangeUserStatusResult> {
    const now = this.clock.now();
    const outcome = await this.users.changeStatusPreservingCapableAdmin({
      targetUserId: input.targetUserId, status: input.status, actorUserId: input.actor.userId, now, context: input.context,
      auditEvents: [{
        correlationId: input.context.correlationId, actorUserId: input.actor.userId, action: "user.status_changed",
        targetType: "user", targetId: input.targetUserId, result: "succeeded", reason: null,
        metadata: { status: input.status }, context: input.context, occurredAt: now,
      }],
    });
    if (outcome === "not_found") throw new NotFoundError("unknown user");
    if (outcome === "invalid_status_transition") throw new ConflictError("invalid_status_transition");
    if (outcome === "would_remove_last_admin") throw new ConflictError("would_remove_last_admin");
    return { userId: input.targetUserId, status: input.status };
  }
}
