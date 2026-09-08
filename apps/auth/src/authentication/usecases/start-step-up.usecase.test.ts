import { describe, expect, it, vi } from "vitest";
import { StartStepUpUseCase } from "./start-step-up.usecase";
import { Clock } from "../../common/clock";
import { SecretGenerator } from "../../common/secret-generator";
import { AuthenticationFailedError, RateLimitedError, RequiredDependencyUnavailableError } from "../../common/errors";
import { hashSecretToken } from "../../crypto/secret-token";
import { SECURITY_POLICY } from "../../config/security-policy";
import type { StartStepUpAttemptCommand } from "../../mfa/ports/authentication-repository";
import { fakeAuthenticationRepository } from "../../testing/authentication-repository.double";
import type { AuthenticatedActor, User } from "../../users/user";
import type { UserReader } from "../../users/ports/user-repository";

const now = new Date("2026-09-04T12:00:00.000Z");
const context = { correlationId: "test", ipAddress: "127.0.0.1", userAgent: "vitest" };
const actor: AuthenticatedActor = { userId: "user", sessionId: "session", roles: ["member"], permissions: [], denies: [], amr: ["pwd", "otp"], authTime: 0 };
class FixedClock extends Clock { now(): Date { return now; } }
class FixedSecrets extends SecretGenerator { private id = 0; randomId(): string { return `id-${++this.id}`; } randomBytes(length: number): Buffer { return Buffer.alloc(length, 7); } }

const activeUser: User = { id: "user", email: "user@example.test", name: "User", passwordHash: "hash", status: "active", createdAt: now, updatedAt: now };
function users(user: User | null = activeUser): UserReader { return { findById: vi.fn().mockResolvedValue(user), findByEmail: vi.fn() }; }
const allowingLimiter = { hit: vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }) };
const limits = { mfaSendUser: { attempts: 3, windowSeconds: 600 } };

describe("StartStepUpUseCase", () => {
  it("sends an OTP and stores the attempt bound to the caller session", async () => {
    const startStepUpAttempt = vi.fn().mockResolvedValue("created");
    const repo = fakeAuthenticationRepository({ startStepUpAttempt });
    const otp = { start: vi.fn().mockResolvedValue({ codeHash: "code-hash" }) };
    const usecase = new StartStepUpUseCase(users(), repo, otp, { hit: vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }) }, new FixedClock(), new FixedSecrets(), limits);

    const result = await usecase.execute({ actor, purpose: "password_change", secondFactor: "otp", context });

    expect(result).toMatchObject({ purpose: "password_change", secondFactor: "otp", channel: "email", maskedDestination: "u***@example.test" });
    expect(result.expiresAt).toEqual(new Date(now.getTime() + SECURITY_POLICY.mfaChallengeTtlSeconds * 1000));
    const command = startStepUpAttempt.mock.calls[0]![0] as StartStepUpAttemptCommand;
    expect(command).toMatchObject({ userId: "user", originSessionId: "session", purpose: "password_change", secondFactor: "otp", invalidatedAt: null });
    expect(command.tokenHash).toBe(hashSecretToken(result.stepUpToken));
    expect(command.expiresAt).toEqual(new Date(now.getTime() + SECURITY_POLICY.authenticationAttemptTtlSeconds * 1000));
    expect(command.challenge).toEqual({ id: "id-2", codeHash: "code-hash", expiresAt: result.expiresAt, invalidatedAt: null });
    expect(otp.start).toHaveBeenCalledWith({ email: activeUser.email, challengeId: "id-2" });
    // O token em claro nunca chega ao repositorio.
    expect(JSON.stringify(command)).not.toContain(result.stepUpToken);
  });

  it("opens a recovery step-up without touching the OTP provider", async () => {
    const startStepUpAttempt = vi.fn().mockResolvedValue("created");
    const otp = { start: vi.fn() };
    const usecase = new StartStepUpUseCase(users(), fakeAuthenticationRepository({ startStepUpAttempt }), otp, allowingLimiter, new FixedClock(), new FixedSecrets(), limits);

    const result = await usecase.execute({ actor, purpose: "recovery_regeneration", secondFactor: "recovery", context });

    expect(result).toMatchObject({ purpose: "recovery_regeneration", secondFactor: "recovery" });
    expect(result.channel).toBeUndefined();
    expect(result.expiresAt).toEqual(new Date(now.getTime() + SECURITY_POLICY.authenticationAttemptTtlSeconds * 1000));
    expect(otp.start).not.toHaveBeenCalled();
    expect((startStepUpAttempt.mock.calls[0]![0] as StartStepUpAttemptCommand).challenge).toBeNull();
  });

  it("refuses the fourth OTP send inside the window before calling the provider", async () => {
    const otp = { start: vi.fn() };
    const limiter = { hit: vi.fn().mockResolvedValue({ allowed: false, retryAfterSeconds: 420 }) };
    const usecase = new StartStepUpUseCase(users(), fakeAuthenticationRepository(), otp, limiter, new FixedClock(), new FixedSecrets(), limits);

    await expect(usecase.execute({ actor, purpose: "password_change", secondFactor: "otp", context })).rejects.toBeInstanceOf(RateLimitedError);
    expect(otp.start).not.toHaveBeenCalled();
  });

  it("reports an email send failure without creating an attempt", async () => {
    const startStepUpAttempt = vi.fn().mockResolvedValue("created");
    const otp = { start: vi.fn().mockRejectedValue(new Error("SMTP unavailable")) };
    const usecase = new StartStepUpUseCase(users(), fakeAuthenticationRepository({ startStepUpAttempt }), otp, allowingLimiter, new FixedClock(), new FixedSecrets(), limits);

    await expect(usecase.execute({ actor, purpose: "password_change", secondFactor: "otp", context })).rejects.toBeInstanceOf(RequiredDependencyUnavailableError);
    expect(otp.start).toHaveBeenCalledWith({ email: activeUser.email, challengeId: "id-2" });
    expect(startStepUpAttempt).not.toHaveBeenCalled();
  });

  it("refuses a step-up for a user who is no longer active", async () => {
    const usecase = new StartStepUpUseCase(users({ ...activeUser, status: "suspended" }), fakeAuthenticationRepository(), { start: vi.fn() }, allowingLimiter, new FixedClock(), new FixedSecrets(), limits);
    await expect(usecase.execute({ actor, purpose: "password_change", secondFactor: "otp", context })).rejects.toBeInstanceOf(AuthenticationFailedError);
  });
});
