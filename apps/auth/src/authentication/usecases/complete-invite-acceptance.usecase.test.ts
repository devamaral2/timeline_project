import { describe, expect, it, vi } from "vitest";
import { CompleteInviteAcceptanceUseCase } from "./complete-invite-acceptance.usecase";
import { Clock } from "../../common/clock";
import { SecretGenerator } from "../../common/secret-generator";
import type { AuthenticationRepository, CompleteInviteEnrollmentCommand } from "../../mfa/ports/authentication-repository";
import type { OtpVerificationGateway } from "../../mfa/otp-verification.gateway";
import { AuthenticationFailedError, RequiredDependencyUnavailableError } from "../../common/errors";

const now = new Date("2026-09-03T12:00:00.000Z");
const context = { correlationId: "test", ipAddress: "127.0.0.1", userAgent: "vitest" };
class FixedClock extends Clock { now(): Date { return now; } }
class FixedSecrets extends SecretGenerator { private id = 0; randomId(): string { return `id-${++this.id}`; } randomBytes(length: number): Buffer { return Buffer.alloc(length, this.id++); } }
const prepared = { attemptId: "attempt", userId: "user", purpose: "invite_acceptance" as const, challengeId: "challenge", providerChallengeId: "provider", requestedChannel: "sms" as const, reportedChannel: "sms" as const };

function repository(overrides: Partial<AuthenticationRepository> = {}): AuthenticationRepository {
  return {
    startInviteAttempt: vi.fn(), startLoginAttempt: vi.fn(), attemptPurpose: vi.fn().mockResolvedValue("invite_acceptance"), prepareMfaResend: vi.fn(), replaceMfaChallenge: vi.fn(), completeLogin: vi.fn(), startStepUpAttempt: vi.fn(), markStepUpVerified: vi.fn(), markStepUpVerifiedWithRecovery: vi.fn(), changePasswordWithStepUp: vi.fn(), regenerateRecoveryCodesWithStepUp: vi.fn(), prepareOtpCheck: vi.fn().mockResolvedValue(prepared), invalidateOtpChallenge: vi.fn().mockResolvedValue("invalidated"), recordAuditEvent: vi.fn().mockResolvedValue(undefined),
    completeInviteEnrollment: vi.fn().mockImplementation(async (command: CompleteInviteEnrollmentCommand) => ({ userId: "user", sessionId: command.newSession.id, accessToken: "access", refreshTokenExpiresAt: command.newSession.refreshToken.expiresAt, access: { roleKeys: [], permissions: [], denies: [] } })),
    ...overrides,
  };
}

describe("CompleteInviteAcceptanceUseCase", () => {
  it("commits once and returns clear recovery and refresh secrets only after commit", async () => {
    const repo = repository();
    const otp: OtpVerificationGateway = { start: vi.fn(), check: vi.fn().mockResolvedValue({ approved: true, reportedChannel: "sms" }) };
    const usecase = new CompleteInviteAcceptanceUseCase(otp, repo, new FixedClock(), new FixedSecrets(), () => "access");
    const result = await usecase.execute({ mfaToken: "opaque", code: "000000", context });
    expect(otp.check).toHaveBeenCalledOnce();
    expect(repo.completeInviteEnrollment).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ accessToken: "access", accessTokenExpiresInSeconds: 900 });
    expect(result.refreshToken).not.toBe("");
    expect(result.recoveryCodes).toHaveLength(10);
    expect(result.recoveryCodes.every((code) => /^[A-Z2-7]{4}(?:-[A-Z2-7]{4}){3}$/.test(code))).toBe(true);
  });

  it("does not reveal secrets when the atomic commit loses a race", async () => {
    const repo = repository({ completeInviteEnrollment: vi.fn().mockResolvedValue("invalid") });
    const otp: OtpVerificationGateway = { start: vi.fn(), check: vi.fn().mockResolvedValue({ approved: true, reportedChannel: "sms" }) };
    const usecase = new CompleteInviteAcceptanceUseCase(otp, repo, new FixedClock(), new FixedSecrets(), () => "access");
    await expect(usecase.execute({ mfaToken: "opaque", code: "000000", context })).rejects.toBeInstanceOf(AuthenticationFailedError);
  });

  it("invalidates a challenge when the provider reports a different channel", async () => {
    const repo = repository();
    const otp: OtpVerificationGateway = { start: vi.fn(), check: vi.fn().mockResolvedValue({ approved: true, reportedChannel: "whatsapp" }) };
    const usecase = new CompleteInviteAcceptanceUseCase(otp, repo, new FixedClock(), new FixedSecrets(), () => "access");
    await expect(usecase.execute({ mfaToken: "opaque", code: "000000", context })).rejects.toBeInstanceOf(RequiredDependencyUnavailableError);
    expect(repo.invalidateOtpChallenge).toHaveBeenCalledOnce();
    expect(repo.completeInviteEnrollment).not.toHaveBeenCalled();
  });

  it("audits a rejected OTP without consuming the attempt", async () => {
    const repo = repository();
    const otp: OtpVerificationGateway = { start: vi.fn(), check: vi.fn().mockResolvedValue({ approved: false, reportedChannel: "sms" }) };
    const usecase = new CompleteInviteAcceptanceUseCase(otp, repo, new FixedClock(), new FixedSecrets(), () => "access");
    await expect(usecase.execute({ mfaToken: "opaque", code: "bad", context })).rejects.toBeInstanceOf(AuthenticationFailedError);
    expect(repo.recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "mfa.failed", result: "failed" }));
    expect(repo.completeInviteEnrollment).not.toHaveBeenCalled();
  });
});
