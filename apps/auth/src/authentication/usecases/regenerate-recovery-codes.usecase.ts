import { AuthenticationFailedError } from "../../common/errors";
import type { AuditAction, AuditEventInput } from "../../audit/audit-event";
import type { Clock } from "../../common/clock";
import type { RequestContext } from "../../common/request-context";
import type { SecretGenerator } from "../../common/secret-generator";
import { hashSecretToken } from "../../crypto/secret-token";
import { generateRecoveryCodes } from "../../mfa/recovery-code";
import type { AuthenticationRepository } from "../../mfa/ports/authentication-repository";
import type { AuthenticatedActor } from "../../users/user";

export interface RegenerateRecoveryCodesResult { recoveryCodes: string[] }

function audit(actor: AuthenticatedActor, context: RequestContext, occurredAt: Date, action: AuditAction): AuditEventInput {
  return { correlationId: context.correlationId, actorUserId: actor.userId, action, targetType: "user", targetId: actor.userId, result: "succeeded", reason: null, metadata: {}, context, occurredAt };
}

/**
 * Emite uma nova geracao de recovery codes atras de um step-up de uso unico.
 *
 * Os dez codigos sao sorteados fora da transacao -- gerar segredo nao precisa
 * de lock -- e so o texto em claro volta na resposta, uma unica vez. A
 * transacao consome o step-up, revoga a geracao anterior e grava a nova.
 *
 * Diferente da troca de senha, **nao** revoga sessao nenhuma: trocar o papel
 * que destranca a conta nao e motivo para derrubar quem ja esta dentro.
 */
export class RegenerateRecoveryCodesUseCase {
  constructor(
    private readonly repo: AuthenticationRepository,
    private readonly clock: Clock,
    private readonly secrets: SecretGenerator,
  ) {}

  async execute(input: { actor: AuthenticatedActor; stepUpToken: string; context: RequestContext }): Promise<RegenerateRecoveryCodesResult> {
    const now = this.clock.now();
    const recoveryCodes = generateRecoveryCodes(this.secrets);
    const result = await this.repo.regenerateRecoveryCodesWithStepUp({
      attemptTokenHash: hashSecretToken(input.stepUpToken), userId: input.actor.userId, originSessionId: input.actor.sessionId,
      recoveryCodes, now,
      auditEvents: [audit(input.actor, input.context, now, "step_up.consumed"), audit(input.actor, input.context, now, "recovery.regenerated")],
    });
    if (result !== "regenerated") throw new AuthenticationFailedError("step up not usable for recovery regeneration");
    return { recoveryCodes: recoveryCodes.map((code) => code.plainText) };
  }
}
