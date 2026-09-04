import { AuthenticationFailedError } from "../../common/errors";
import { canSignIn, type AuthenticatedActor } from "../../users/user";
import type { UserRepository } from "../../users/ports/user-repository";
import type { RbacRepository } from "../../rbac/ports/rbac-repository";
import type { Permission } from "../../rbac/permissions";
import type { SessionRepository } from "../ports/session-repository";

export interface Me {
  userId: string;
  email: string;
  name: string;
  sessionId: string;
  roles: string[];
  permissions: Permission[];
  denies: Permission[];
}

/**
 * Releem usuario e sessao a partir do banco — o bearer prova identidade no
 * instante em que foi assinado, nao que a sessao ou o usuario continuam
 * ativos agora.
 */
export class GetMeUseCase {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly users: UserRepository,
    private readonly rbac: RbacRepository,
  ) {}

  async execute(actor: AuthenticatedActor): Promise<Me> {
    const [session, user] = await Promise.all([
      this.sessions.findActiveSession({ sessionId: actor.sessionId, userId: actor.userId }),
      this.users.findById(actor.userId),
    ]);
    if (!session || !user || !canSignIn(user)) throw new AuthenticationFailedError("session or user not active");

    const access = await this.rbac.resolvedAccessOf(actor.userId);
    return {
      userId: user.id,
      email: user.email,
      name: user.name,
      sessionId: session.id,
      roles: access.roleKeys,
      permissions: access.permissions,
      denies: access.denies,
    };
  }
}
