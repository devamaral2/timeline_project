import { AuthenticationFailedError, RateLimitedError, RequiredDependencyUnavailableError } from "../../common/errors";
import type { Clock } from "../../common/clock";
import type { RequestContext } from "../../common/request-context";
import type { SecretGenerator } from "../../common/secret-generator";
import { SECURITY_POLICY } from "../../config/security-policy";
import { hashSecretToken } from "../../crypto/secret-token";
import type { AuditEventInput } from "../../audit/audit-event";
import type { SecondFactor, StepUpPurpose } from "../../mfa/authentication-attempt";
import { maskPhone, type MfaChannel } from "../../mfa/mfa-challenge";
import type { OtpVerificationGateway } from "../../mfa/otp-verification.gateway";
import type { AuthenticationRepository } from "../../mfa/ports/authentication-repository";
import type { RateLimiter } from "../../rate-limit/rate-limiter";
import type { UserReader } from "../../users/ports/user-repository";
import type { AuthenticatedActor } from "../../users/user";

export interface StartStepUpInput { actor: AuthenticatedActor; purpose: StepUpPurpose; secondFactor: SecondFactor; context: RequestContext }
export interface StartStepUpOutput { stepUpToken: string; purpose: StepUpPurpose; secondFactor: SecondFactor; channel?: MfaChannel; maskedDestination?: string; expiresAt: Date }

function audit(actor: AuthenticatedActor, context: RequestContext, occurredAt: Date, purpose: StepUpPurpose): AuditEventInput {
  return { correlationId: context.correlationId, actorUserId: actor.userId, action: "step_up.started", targetType: "user", targetId: actor.userId, result: "succeeded", reason: null, metadata: { purpose }, context, occurredAt };
}

/**
 * Abre um step-up para uma operacao sensivel. O token devolvido ainda nao
 * autoriza nada: ele so passa a valer depois que `CompleteStepUpUseCase` marca
 * o segundo fator como aprovado, e mesmo entao vale para uma unica operacao,
 * a do `purpose` escolhido aqui.
 */
export class StartStepUpUseCase {
  constructor(
    private readonly users: UserReader,
    private readonly repo: AuthenticationRepository,
    private readonly otp: OtpVerificationGateway,
    private readonly limiter: RateLimiter,
    private readonly clock: Clock,
    private readonly secrets: SecretGenerator,
    private readonly limits: { mfaSendUser: { attempts: number; windowSeconds: number } },
  ) {}

  async execute(input: StartStepUpInput): Promise<StartStepUpOutput> {
    const now = this.clock.now();
    const user = await this.users.findById(input.actor.userId);
    if (!user || user.status !== "active") throw new AuthenticationFailedError("step up for inactive user");

    const stepUpToken = this.secrets.randomBytes(32).toString("base64url");
    const expiresAt = new Date(now.getTime() + SECURITY_POLICY.authenticationAttemptTtlSeconds * 1000);
    const base = {
      id: this.secrets.randomId(), tokenHash: hashSecretToken(stepUpToken), userId: user.id,
      originSessionId: input.actor.sessionId, purpose: input.purpose, secondFactor: input.secondFactor,
      expiresAt, now, auditEvents: [audit(input.actor, input.context, now, input.purpose)],
    };

    // Recovery nao fala com provider nenhum -- e o caminho que continua de pe
    // com o Twilio fora do ar.
    if (input.secondFactor === "recovery") {
      const created = await this.repo.startStepUpAttempt({ ...base, challenge: null, invalidatedAt: null });
      if (created !== "created") throw new AuthenticationFailedError("step up attempt invalid");
      return { stepUpToken, purpose: input.purpose, secondFactor: input.secondFactor, expiresAt };
    }

    if (!user.phoneE164 || !user.mfaChannel) throw new AuthenticationFailedError("missing mfa enrollment");
    const limited = await this.limiter.hit({ scope: "mfa_send_user", subject: user.id, limit: this.limits.mfaSendUser.attempts, windowSeconds: this.limits.mfaSendUser.windowSeconds, now });
    if (!limited.allowed) throw new RateLimitedError(limited.retryAfterSeconds, "step up otp send");

    let started: Awaited<ReturnType<OtpVerificationGateway["start"]>>;
    try {
      started = await this.otp.start({ phoneE164: user.phoneE164, channel: user.mfaChannel });
    } catch (error) {
      throw new RequiredDependencyUnavailableError("otp start", { cause: error });
    }

    // Canal divergente grava o desafio ja invalidado: o attempt fica registrado
    // para a auditoria e ninguem consegue reaproveita-lo.
    const mismatch = started.reportedChannel !== user.mfaChannel;
    const created = await this.repo.startStepUpAttempt({
      ...base, invalidatedAt: mismatch ? now : null,
      challenge: { id: this.secrets.randomId(), providerChallengeId: started.providerChallengeId, requestedChannel: user.mfaChannel, reportedChannel: started.reportedChannel, expiresAt: new Date(now.getTime() + SECURITY_POLICY.mfaChallengeTtlSeconds * 1000), invalidatedAt: mismatch ? now : null },
    });
    if (created !== "created") throw new AuthenticationFailedError("step up attempt invalid");
    if (mismatch) throw new RequiredDependencyUnavailableError("otp channel mismatch");
    return { stepUpToken, purpose: input.purpose, secondFactor: input.secondFactor, channel: user.mfaChannel, maskedDestination: maskPhone(user.phoneE164), expiresAt };
  }
}
