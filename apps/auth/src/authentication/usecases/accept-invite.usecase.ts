import { AuthenticationFailedError } from "../../common/errors";
import type { Clock } from "../../common/clock";
import type { RequestContext } from "../../common/request-context";
import { hashSecretToken } from "../../crypto/secret-token";
import type { PreparePassword } from "../../credentials/prepare-password";
import type { InviteRepository } from "../../invites/ports/invite-repository";

/** Ativa o convite usando apenas a senha; o telefone continua ausente. */
export class AcceptInviteUseCase {
  constructor(
    private readonly invites: InviteRepository,
    private readonly preparePassword: PreparePassword,
    private readonly clock: Clock,
  ) {}

  async execute(input: { inviteToken: string; password: string; context: RequestContext }): Promise<{ accepted: true }> {
    const now = this.clock.now();
    const invite = await this.invites.inspectByTokenHash(hashSecretToken(input.inviteToken), now);
    if (!invite) throw new AuthenticationFailedError("invalid invite");

    const prepared = await this.preparePassword.execute({ password: input.password, normalizedEmail: invite.email, name: invite.name });
    const result = await this.invites.acceptInvite({
      inviteId: invite.inviteId,
      userId: invite.userId,
      passwordHash: prepared.passwordHash,
      now,
    });
    if (result !== "accepted") throw new AuthenticationFailedError("invite consumed during acceptance");
    return { accepted: true };
  }
}
