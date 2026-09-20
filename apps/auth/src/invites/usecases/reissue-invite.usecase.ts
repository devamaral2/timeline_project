import { ConflictError, NotFoundError } from "../../common/errors";
import type { Clock } from "../../common/clock";
import type { RequestContext } from "../../common/request-context";
import type { SecretGenerator } from "../../common/secret-generator";
import { SECURITY_POLICY } from "../../config/security-policy";
import { hashSecretToken } from "../../crypto/secret-token";
import type { AuthenticatedActor } from "../../users/user";
import { inviteLink } from "../invite";
import type { InviteRepository } from "../ports/invite-repository";

export interface ReissueInviteResult { inviteLink: string; expiresAt: string }

/**
 * Reemite o convite de quem ainda nao aceitou. O RBAC montado na criacao e
 * preservado -- reemitir e trocar o link, nao repensar o acesso.
 */
export class ReissueInviteUseCase {
  constructor(
    private readonly invites: InviteRepository,
    private readonly clock: Clock,
    private readonly secrets: SecretGenerator,
    private readonly webAppUrl: URL,
  ) {}

  async execute(input: { actor: AuthenticatedActor; targetUserId: string; context: RequestContext }): Promise<ReissueInviteResult> {
    const now = this.clock.now();
    const token = this.secrets.randomBytes(32).toString("base64url");
    const expiresAt = new Date(now.getTime() + SECURITY_POLICY.inviteTtlSeconds * 1000);

    const outcome = await this.invites.reissueInvite({
      targetUserId: input.targetUserId,
      invite: { id: this.secrets.randomId(), tokenHash: hashSecretToken(token), expiresAt },
      issuerUserId: input.actor.userId, now,
      auditEvents: [{
        correlationId: input.context.correlationId, actorUserId: input.actor.userId, action: "invite.reissued",
        targetType: "user", targetId: input.targetUserId, result: "succeeded", reason: null, metadata: {},
        context: input.context, occurredAt: now,
      }],
    });
    if (outcome === "not_found") throw new NotFoundError("unknown user");
    if (outcome === "not_pending") throw new ConflictError("invalid_status_transition");
    return { inviteLink: inviteLink(this.webAppUrl, token), expiresAt: expiresAt.toISOString() };
  }
}
