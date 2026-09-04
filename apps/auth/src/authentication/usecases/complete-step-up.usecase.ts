import { AuthenticationFailedError, RateLimitedError, RequiredDependencyUnavailableError } from "../../common/errors";
import type { AuditAction, AuditEventInput, AuditResult } from "../../audit/audit-event";
import type { Clock } from "../../common/clock";
import type { RequestContext } from "../../common/request-context";
import { hashSecretToken } from "../../crypto/secret-token";
import { isStepUpPurpose, type StepUpPurpose } from "../../mfa/authentication-attempt";
import { hashRecoveryCode, normalizeRecoveryCode } from "../../mfa/recovery-code";
import type { OtpVerificationGateway } from "../../mfa/otp-verification.gateway";
import type { AuthenticationRepository } from "../../mfa/ports/authentication-repository";
import type { RateLimiter } from "../../rate-limit/rate-limiter";
import type { AuthenticatedActor } from "../../users/user";

export interface CompleteStepUpOutput { stepUpToken: string; purpose: StepUpPurpose }

function audit(actor: AuthenticatedActor, context: RequestContext, occurredAt: Date, action: AuditAction, result: AuditResult, reason: string | null): AuditEventInput {
  return { correlationId: context.correlationId, actorUserId: actor.userId, action, targetType: "user", targetId: actor.userId, result, reason, metadata: {}, context, occurredAt };
}

/**
 * Aprova o segundo fator de um step-up. Aprovar **nao** consome a autorizacao:
 * o attempt fica `verified_at` preenchido e `consumed_at` nulo, e quem o
 * consome e a operacao seguinte (`/auth/password/change` ou
 * `/auth/recovery-codes/regenerate`). Sem isso uma falha na troca de senha
 * queimaria a autorizacao e obrigaria o usuario a receber outro OTP.
 */
export class CompleteStepUpUseCase {
  constructor(
    private readonly repo: AuthenticationRepository,
    private readonly otp: OtpVerificationGateway,
    private readonly limiter: RateLimiter,
    private readonly clock: Clock,
    private readonly limits: { factorCheckAttempt: { attempts: number; windowSeconds: number } },
  ) {}

  async verify(input: { actor: AuthenticatedActor; stepUpToken: string; code: string; context: RequestContext }): Promise<CompleteStepUpOutput> {
    const now = this.clock.now();
    const attemptTokenHash = hashSecretToken(input.stepUpToken);
    const prepared = await this.repo.prepareOtpCheck({ attemptTokenHash, now });
    if (prepared === "invalid" || !isStepUpPurpose(prepared.purpose) || prepared.userId !== input.actor.userId) {
      throw new AuthenticationFailedError("invalid step up challenge");
    }

    let checked: Awaited<ReturnType<OtpVerificationGateway["check"]>>;
    try {
      checked = await this.otp.check({ providerChallengeId: prepared.providerChallengeId, code: input.code });
    } catch (error) {
      throw new RequiredDependencyUnavailableError("otp check", { cause: error });
    }
    if (checked.reportedChannel !== prepared.reportedChannel) {
      await this.repo.invalidateOtpChallenge({ attemptId: prepared.attemptId, challengeId: prepared.challengeId, now, auditEvent: audit(input.actor, input.context, now, "step_up.failed", "failed", "otp_channel_mismatch") });
      throw new RequiredDependencyUnavailableError("otp channel mismatch");
    }
    if (!checked.approved) {
      await this.repo.recordAuditEvent(audit(input.actor, input.context, now, "step_up.failed", "failed", "otp_rejected"));
      throw new AuthenticationFailedError("otp rejected");
    }

    const marked = await this.repo.markStepUpVerified({ attemptTokenHash, challengeId: prepared.challengeId, verifiedAt: now, auditEvents: [audit(input.actor, input.context, now, "step_up.verified", "succeeded", null)] });
    if (marked !== "verified") throw new AuthenticationFailedError("step up not verifiable");
    return { stepUpToken: input.stepUpToken, purpose: prepared.purpose };
  }

  async recover(input: { actor: AuthenticatedActor; stepUpToken: string; recoveryCode: string; context: RequestContext }): Promise<CompleteStepUpOutput> {
    const now = this.clock.now();
    const attemptTokenHash = hashSecretToken(input.stepUpToken);
    const canonical = normalizeRecoveryCode(input.recoveryCode);
    if (!canonical) throw new AuthenticationFailedError("malformed recovery code");

    // O balde e por attempt, e nao por usuario: cinco palpites gastam este
    // step-up, nao a conta inteira.
    const limited = await this.limiter.hit({ scope: "factor_check_attempt", subject: attemptTokenHash, limit: this.limits.factorCheckAttempt.attempts, windowSeconds: this.limits.factorCheckAttempt.windowSeconds, now });
    if (!limited.allowed) throw new RateLimitedError(limited.retryAfterSeconds, "step up recovery checks");

    const purpose = await this.repo.attemptPurpose(attemptTokenHash, now);
    if (!isStepUpPurpose(purpose)) throw new AuthenticationFailedError("invalid step up attempt");

    const marked = await this.repo.markStepUpVerifiedWithRecovery({
      attemptTokenHash, recoveryCodeHash: hashRecoveryCode(canonical), verifiedAt: now,
      auditEvents: [audit(input.actor, input.context, now, "recovery.used", "succeeded", null), audit(input.actor, input.context, now, "step_up.verified", "succeeded", null)],
    });
    if (marked !== "verified") throw new AuthenticationFailedError("recovery rejected");
    return { stepUpToken: input.stepUpToken, purpose };
  }
}
