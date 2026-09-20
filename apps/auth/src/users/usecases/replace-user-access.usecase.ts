import { ConflictError, NotFoundError } from "../../common/errors";
import type { Clock } from "../../common/clock";
import type { RequestContext } from "../../common/request-context";
import type { DirectPermission } from "../../rbac/effective-permissions";
import type { AuthenticatedActor } from "../user";
import type { UserRepository } from "../ports/user-repository";

export interface ReplaceUserAccessResult { userId: string; roleKeys: string[]; directPermissions: DirectPermission[] }

/**
 * Substituicao total do acesso: o que nao veio no corpo deixa de existir.
 *
 * O efeito no token nao e imediato de proposito -- papeis e permissoes viajam
 * dentro do access token, que dura 15 minutos. O JWT ja emitido continua
 * valendo com o conteudo antigo; o novo acesso aparece no proximo refresh.
 */
export class ReplaceUserAccessUseCase {
  constructor(private readonly users: UserRepository, private readonly clock: Clock) {}

  async execute(input: { actor: AuthenticatedActor; targetUserId: string; roleKeys: readonly string[]; directPermissions: readonly DirectPermission[]; context: RequestContext }): Promise<ReplaceUserAccessResult> {
    const now = this.clock.now();
    const outcome = await this.users.replaceAccessPreservingCapableAdmin({
      targetUserId: input.targetUserId, roleKeys: input.roleKeys, directPermissions: input.directPermissions,
      actorUserId: input.actor.userId, now, context: input.context,
      auditEvents: [{
        correlationId: input.context.correlationId, actorUserId: input.actor.userId, action: "access.changed",
        targetType: "user", targetId: input.targetUserId, result: "succeeded", reason: null,
        metadata: { roleKeys: [...input.roleKeys], directPermissions: input.directPermissions.length },
        context: input.context, occurredAt: now,
      }],
    });
    if (outcome === "not_found") throw new NotFoundError("unknown user");
    if (outcome === "would_remove_last_admin") throw new ConflictError("would_remove_last_admin");
    return { userId: input.targetUserId, roleKeys: [...input.roleKeys], directPermissions: [...input.directPermissions] };
  }
}
