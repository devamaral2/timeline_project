import { describe, expect, it, vi } from "vitest";
import { CompleteStepUpUseCase } from "./complete-step-up.usecase";
import { Clock } from "../../common/clock";
import { AuthenticationFailedError, RateLimitedError, RequiredDependencyUnavailableError } from "../../common/errors";
import { hashRecoveryCode } from "../../mfa/recovery-code";
import { fakeAuthenticationRepository } from "../../testing/authentication-repository.double";
import type { AuthenticatedActor } from "../../users/user";

const now = new Date("2026-09-04T12:00:00.000Z");
const context = { correlationId: "test", ipAddress: "127.0.0.1", userAgent: "vitest" };
const actor: AuthenticatedActor = { userId: "user", sessionId: "session", roles: ["member"], permissions: [], denies: [], amr: ["pwd", "otp"], authTime: 0 };
class FixedClock extends Clock { now(): Date { return now; } }
const prepared = { attemptId: "attempt", userId: "user", purpose: "password_change" as const, challengeId: "challenge", providerChallengeId: "provider", requestedChannel: "sms" as const, reportedChannel: "sms" as const };
const limits = { factorCheckAttempt: { attempts: 5, windowSeconds: 600 } };
const allowingLimiter = { hit: vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }) };

describe("CompleteStepUpUseCase.verify", () => {
  it("marks the step-up verified without consuming it and echoes the same token", async () => {
    const markStepUpVerified = vi.fn().mockResolvedValue("verified");
    const repo = fakeAuthenticationRepository({ prepareOtpCheck: vi.fn().mockResolvedValue(prepared), markStepUpVerified });
    const otp = { start: vi.fn(), check: vi.fn().mockResolvedValue({ approved: true, reportedChannel: "sms" }) };
    const usecase = new CompleteStepUpUseCase(repo, otp, allowingLimiter, new FixedClock(), limits);

    const result = await usecase.verify({ actor, stepUpToken: "opaque", code: "000000", context });

    expect(result).toEqual({ stepUpToken: "opaque", purpose: "password_change" });
    expect(markStepUpVerified).toHaveBeenCalledWith(expect.objectContaining({ challengeId: "challenge", verifiedAt: now }));
    expect(markStepUpVerified.mock.calls[0]![0].auditEvents).toHaveLength(1);
  });

  it("refuses an attempt that belongs to another user", async () => {
    const repo = fakeAuthenticationRepository({ prepareOtpCheck: vi.fn().mockResolvedValue({ ...prepared, userId: "someone-else" }) });
    const otp = { start: vi.fn(), check: vi.fn() };
    const usecase = new CompleteStepUpUseCase(repo, otp, allowingLimiter, new FixedClock(), limits);

    await expect(usecase.verify({ actor, stepUpToken: "opaque", code: "000000", context })).rejects.toBeInstanceOf(AuthenticationFailedError);
    expect(otp.check).not.toHaveBeenCalled();
  });

  it("refuses an attempt whose purpose is a login or an invite, not a step-up", async () => {
    const repo = fakeAuthenticationRepository({ prepareOtpCheck: vi.fn().mockResolvedValue({ ...prepared, purpose: "login" }) });
    const otp = { start: vi.fn(), check: vi.fn() };
    const usecase = new CompleteStepUpUseCase(repo, otp, allowingLimiter, new FixedClock(), limits);

    await expect(usecase.verify({ actor, stepUpToken: "opaque", code: "000000", context })).rejects.toBeInstanceOf(AuthenticationFailedError);
    expect(otp.check).not.toHaveBeenCalled();
  });

  it("audits a rejected code and leaves the attempt unverified", async () => {
    const recordAuditEvent = vi.fn().mockResolvedValue(undefined);
    const markStepUpVerified = vi.fn();
    const repo = fakeAuthenticationRepository({ prepareOtpCheck: vi.fn().mockResolvedValue(prepared), recordAuditEvent, markStepUpVerified });
    const otp = { start: vi.fn(), check: vi.fn().mockResolvedValue({ approved: false, reportedChannel: "sms" }) };
    const usecase = new CompleteStepUpUseCase(repo, otp, allowingLimiter, new FixedClock(), limits);

    await expect(usecase.verify({ actor, stepUpToken: "opaque", code: "000000", context })).rejects.toBeInstanceOf(AuthenticationFailedError);
    expect(recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "step_up.failed", result: "failed", reason: "otp_rejected" }));
    expect(markStepUpVerified).not.toHaveBeenCalled();
  });

  it("reports an unreachable provider as unavailable, not as a wrong code", async () => {
    const repo = fakeAuthenticationRepository({ prepareOtpCheck: vi.fn().mockResolvedValue(prepared) });
    const otp = { start: vi.fn(), check: vi.fn().mockRejectedValue(new Error("network down")) };
    const usecase = new CompleteStepUpUseCase(repo, otp, allowingLimiter, new FixedClock(), limits);

    await expect(usecase.verify({ actor, stepUpToken: "opaque", code: "000000", context })).rejects.toBeInstanceOf(RequiredDependencyUnavailableError);
  });
});

describe("CompleteStepUpUseCase.recover", () => {
  it("verifies with a recovery code and never touches the OTP provider", async () => {
    const markStepUpVerifiedWithRecovery = vi.fn().mockResolvedValue("verified");
    const repo = fakeAuthenticationRepository({ attemptPurpose: vi.fn().mockResolvedValue("recovery_regeneration"), markStepUpVerifiedWithRecovery });
    const otp = { start: vi.fn(), check: vi.fn() };
    const usecase = new CompleteStepUpUseCase(repo, otp, { hit: vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }) }, new FixedClock(), limits);

    const result = await usecase.recover({ actor, stepUpToken: "opaque", recoveryCode: "aaaa-bbbb-cccc-dddd", context });

    expect(result).toEqual({ stepUpToken: "opaque", purpose: "recovery_regeneration" });
    expect(otp.check).not.toHaveBeenCalled();
    const command = markStepUpVerifiedWithRecovery.mock.calls[0]![0];
    expect(command.recoveryCodeHash).toBe(hashRecoveryCode("AAAABBBBCCCCDDDD"));
    expect(JSON.stringify(command)).not.toContain("AAAABBBBCCCCDDDD");
  });

  it("counts the sixth guess against this attempt and stops before the database", async () => {
    const markStepUpVerifiedWithRecovery = vi.fn();
    const repo = fakeAuthenticationRepository({ markStepUpVerifiedWithRecovery });
    const limiter = { hit: vi.fn().mockResolvedValue({ allowed: false, retryAfterSeconds: 300 }) };
    const usecase = new CompleteStepUpUseCase(repo, { start: vi.fn(), check: vi.fn() }, limiter, new FixedClock(), limits);

    await expect(usecase.recover({ actor, stepUpToken: "opaque", recoveryCode: "AAAA-BBBB-CCCC-DDDD", context })).rejects.toBeInstanceOf(RateLimitedError);
    expect(limiter.hit).toHaveBeenCalledWith(expect.objectContaining({ scope: "factor_check_attempt", limit: 5 }));
    expect(markStepUpVerifiedWithRecovery).not.toHaveBeenCalled();
  });

  it("rejects a malformed code without spending a rate limit hit", async () => {
    const limiter = { hit: vi.fn() };
    const usecase = new CompleteStepUpUseCase(fakeAuthenticationRepository(), { start: vi.fn(), check: vi.fn() }, limiter, new FixedClock(), limits);

    await expect(usecase.recover({ actor, stepUpToken: "opaque", recoveryCode: "nope", context })).rejects.toBeInstanceOf(AuthenticationFailedError);
    expect(limiter.hit).not.toHaveBeenCalled();
  });
});
