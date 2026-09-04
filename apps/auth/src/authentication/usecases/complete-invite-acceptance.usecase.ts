import { AuthenticationFailedError, RequiredDependencyUnavailableError } from "../../common/errors";
import type { Clock } from "../../common/clock";
import type { SecretGenerator } from "../../common/secret-generator";
import { hashSecretToken } from "../../crypto/secret-token";
import { SECURITY_POLICY } from "../../config/security-policy";
import { generateRecoveryCodes } from "../../mfa/recovery-code";
import type { OtpVerificationGateway } from "../../mfa/otp-verification.gateway";
import type { AuthenticationRepository } from "../../mfa/ports/authentication-repository";
import type { SignAccessToken } from "../../crypto/jwt";
import type { RequestContext } from "../../common/request-context";

export interface CompleteInviteAcceptanceResult {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresInSeconds: number;
  refreshTokenExpiresAt: string;
  recoveryCodes: string[];
}

/** Verifies the external OTP before committing the one-time invite enrollment. */
export class CompleteInviteAcceptanceUseCase {
  constructor(
    private readonly otp: OtpVerificationGateway,
    private readonly repo: AuthenticationRepository,
    private readonly clock: Clock,
    private readonly secrets: SecretGenerator,
    private readonly signAccessToken: SignAccessToken,
  ) {}

  async execute(input: { mfaToken: string; code: string; context: RequestContext }): Promise<CompleteInviteAcceptanceResult> {
    const now = this.clock.now();
    const attemptTokenHash = hashSecretToken(input.mfaToken);
    const prepared = await this.repo.prepareOtpCheck({ attemptTokenHash, now });
    if (prepared === "invalid" || prepared.purpose !== "invite_acceptance") throw new AuthenticationFailedError("invalid mfa challenge");

    let checked: Awaited<ReturnType<OtpVerificationGateway["check"]>>;
    try {
      checked = await this.otp.check({ providerChallengeId: prepared.providerChallengeId, code: input.code });
    } catch (error) {
      throw new RequiredDependencyUnavailableError("otp check", { cause: error });
    }
    if (checked.reportedChannel !== prepared.reportedChannel) {
      await this.repo.invalidateOtpChallenge({
        attemptId: prepared.attemptId, challengeId: prepared.challengeId, now,
        auditEvent: audit("invite.failed", "failed", "otp_channel_mismatch", input.context, now),
      });
      throw new RequiredDependencyUnavailableError("otp channel mismatch");
    }
    if (!checked.approved) {
      await this.repo.recordAuditEvent(audit("mfa.failed", "failed", "otp_rejected", input.context, now));
      throw new AuthenticationFailedError("otp rejected");
    }

    const refreshToken = this.secrets.randomBytes(32).toString("base64url");
    const refreshTokenExpiresAt = new Date(now.getTime() + SECURITY_POLICY.refreshTokenTtlSeconds * 1000);
    const recoveryCodes = generateRecoveryCodes(this.secrets);
    const committed = await this.repo.completeInviteEnrollment({
      attemptTokenHash, challengeId: prepared.challengeId, recoveryCodes,
      newSession: {
        id: this.secrets.randomId(), amr: ["pwd", "otp"], authTime: now, issuedAt: now, context: input.context,
        refreshToken: { id: this.secrets.randomId(), hash: hashSecretToken(refreshToken), expiresAt: refreshTokenExpiresAt },
      },
      verifiedAt: now, context: input.context,
      auditEvents: [
        audit("invite.accepted", "succeeded", null, input.context, now),
        audit("mfa.verified", "succeeded", null, input.context, now),
        audit("recovery.generated", "succeeded", null, input.context, now),
        audit("session.issued", "succeeded", null, input.context, now),
      ],
    }, this.signAccessToken);
    if (committed === "invalid") throw new AuthenticationFailedError("invite enrollment already consumed");
    return { accessToken: committed.accessToken, refreshToken, accessTokenExpiresInSeconds: SECURITY_POLICY.accessTokenTtlSeconds, refreshTokenExpiresAt: committed.refreshTokenExpiresAt.toISOString(), recoveryCodes: recoveryCodes.map((code) => code.plainText) };
  }
}

function audit(action: import("../../audit/audit-event").AuditAction, result: import("../../audit/audit-event").AuditResult, reason: string | null, context: RequestContext, occurredAt: Date): import("../../audit/audit-event").AuditEventInput {
  return { correlationId: context.correlationId, actorUserId: null, action, targetType: "invite", targetId: null, result, reason, metadata: {}, context, occurredAt };
}
