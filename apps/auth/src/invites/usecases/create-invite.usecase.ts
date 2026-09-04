import { ConflictError } from "../../common/errors";
import type { Clock } from "../../common/clock";
import type { RequestContext } from "../../common/request-context";
import type { SecretGenerator } from "../../common/secret-generator";
import { SECURITY_POLICY } from "../../config/security-policy";
import { hashSecretToken } from "../../crypto/secret-token";
import type { DirectPermission } from "../../rbac/effective-permissions";
import { normalizeEmail, type AuthenticatedActor } from "../../users/user";
import { inviteLink } from "../invite";
import type { InviteRepository } from "../ports/invite-repository";

export interface CreateInviteInput {
  actor: AuthenticatedActor;
  email: string;
  name: string;
  roleKeys: readonly string[];
  directPermissions: readonly DirectPermission[];
  context: RequestContext;
}
export interface CreateInviteResult { userId: string; inviteLink: string; expiresAt: string }

/**
 * Cria o convidado com o acesso ja montado e devolve o link **uma unica vez**.
 *
 * Nao existe gateway de e-mail em lugar nenhum do servico: o link sai na
 * resposta desta chamada e a entrega acontece fora de banda. Se a resposta se
 * perder, o caminho e reemitir -- nao ha como recuperar o segredo depois, so o
 * hash dele fica no banco.
 */
export class CreateInviteUseCase {
  constructor(
    private readonly invites: InviteRepository,
    private readonly clock: Clock,
    private readonly secrets: SecretGenerator,
    private readonly webAppUrl: URL,
  ) {}

  async execute(input: CreateInviteInput): Promise<CreateInviteResult> {
    const now = this.clock.now();
    const email = normalizeEmail(input.email);
    const name = input.name.trim();
    const token = this.secrets.randomBytes(32).toString("base64url");
    const userId = this.secrets.randomId();
    const expiresAt = new Date(now.getTime() + SECURITY_POLICY.inviteTtlSeconds * 1000);

    const outcome = await this.invites.createPendingUserWithAccessAndInvite({
      userId, email, name, roleKeys: input.roleKeys, directPermissions: input.directPermissions,
      invite: { id: this.secrets.randomId(), tokenHash: hashSecretToken(token), expiresAt },
      issuerUserId: input.actor.userId, now,
      auditEvents: [{
        correlationId: input.context.correlationId, actorUserId: input.actor.userId, action: "invite.created",
        targetType: "user", targetId: userId, result: "succeeded", reason: null,
        metadata: { roleKeys: [...input.roleKeys], directPermissions: input.directPermissions.length },
        context: input.context, occurredAt: now,
      }],
    });
    // Conflito seguro: quem pergunta ja e admin, entao dizer que o e-mail
    // existe nao vaza nada que ele nao possa consultar na propria listagem.
    if (outcome.kind === "email_already_exists") throw new ConflictError("email_already_exists");
    return { userId: outcome.userId, inviteLink: inviteLink(this.webAppUrl, token), expiresAt: expiresAt.toISOString() };
  }
}
