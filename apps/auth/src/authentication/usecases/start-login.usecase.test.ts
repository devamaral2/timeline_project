import { describe, expect, it, vi } from "vitest";
import { StartLoginUseCase } from "./start-login.usecase";
import { Clock } from "../../common/clock";
import { SecretGenerator } from "../../common/secret-generator";
import { AuthenticationFailedError } from "../../common/errors";
import type { CompleteLoginWithoutMfaCommand } from "../../mfa/ports/authentication-repository";
import { fakeAuthenticationRepository } from "../../testing/authentication-repository.double";
import type { LoginCredentialChecker } from "../login-credential-checker";
import type { User } from "../../users/user";
import type { UserReader } from "../../users/ports/user-repository";

const now = new Date("2026-09-04T12:00:00.000Z");
const context = { correlationId: "test", ipAddress: "127.0.0.1", userAgent: "vitest" };
class FixedClock extends Clock { now(): Date { return now; } }
class FixedSecrets extends SecretGenerator { private id = 0; randomId(): string { return `id-${++this.id}`; } randomBytes(length: number): Buffer { return Buffer.alloc(length, 7); } }

const activeUser: User = { id: "user", email: "user@example.test", name: "User", passwordHash: "hash", status: "active", createdAt: now, updatedAt: now };
function users(user: User | null = activeUser): UserReader { return { findById: vi.fn(), findByEmail: vi.fn().mockResolvedValue(user) }; }
const allowingLimiter = { hit: vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }) };
const acceptingCredentials = { check: vi.fn().mockResolvedValue(true) } as unknown as LoginCredentialChecker;
const otp = { start: vi.fn(), check: vi.fn() };
const limits = { passwordEmail: { attempts: 5, windowSeconds: 900 }, passwordIp: { attempts: 30, windowSeconds: 900 }, mfaSendUser: { attempts: 3, windowSeconds: 600 } };
const sign = vi.fn().mockReturnValue("signed.jwt.token");

describe("StartLoginUseCase com MFA suspensa", () => {
  it("emite a sessao completa direto, sem criar tentativa de MFA", async () => {
    const completeLoginWithoutMfa = vi.fn().mockResolvedValue({ userId: "user", sessionId: "session", accessToken: "signed.jwt.token", refreshTokenExpiresAt: new Date(now.getTime() + 1000), access: { roleKeys: [], permissions: [], denies: [] } });
    const repo = fakeAuthenticationRepository({ completeLoginWithoutMfa });
    const usecase = new StartLoginUseCase(users(), acceptingCredentials, allowingLimiter, otp, repo, new FixedClock(), new FixedSecrets(), limits, sign, true);

    const result = await usecase.execute({ email: "user@example.test", password: "senha", secondFactor: "otp", context });

    expect(result).toMatchObject({ accessToken: "signed.jwt.token", accessTokenExpiresInSeconds: expect.any(Number), refreshTokenExpiresAt: new Date(now.getTime() + 1000).toISOString() });
    expect((result as { recoveryCodes: string[] }).recoveryCodes).toHaveLength(10);
    expect((result as { refreshToken: string }).refreshToken).toBeTruthy();
    expect(otp.start).not.toHaveBeenCalled();
    const command = completeLoginWithoutMfa.mock.calls[0]![0] as CompleteLoginWithoutMfaCommand;
    expect(command.userId).toBe("user");
    expect(command.recoveryCodes).toHaveLength(10);
    expect(command.newSession.amr).toEqual(["pwd"]);
  });

  it("mesmo pedindo recovery, ignora o segundo fator e loga direto", async () => {
    const completeLoginWithoutMfa = vi.fn().mockResolvedValue({ userId: "user", sessionId: "session", accessToken: "signed.jwt.token", refreshTokenExpiresAt: now, access: { roleKeys: [], permissions: [], denies: [] } });
    const repo = fakeAuthenticationRepository({ completeLoginWithoutMfa });
    const usecase = new StartLoginUseCase(users(), acceptingCredentials, allowingLimiter, otp, repo, new FixedClock(), new FixedSecrets(), limits, sign, true);

    const result = await usecase.execute({ email: "user@example.test", password: "senha", secondFactor: "recovery", context });

    expect((result as { accessToken: string }).accessToken).toBe("signed.jwt.token");
    expect(completeLoginWithoutMfa).toHaveBeenCalledTimes(1);
  });

  it("propaga falha de autenticacao quando o repositorio recusa a sessao", async () => {
    const repo = fakeAuthenticationRepository({ completeLoginWithoutMfa: vi.fn().mockResolvedValue("invalid") });
    const usecase = new StartLoginUseCase(users(), acceptingCredentials, allowingLimiter, otp, repo, new FixedClock(), new FixedSecrets(), limits, sign, true);

    await expect(usecase.execute({ email: "user@example.test", password: "senha", secondFactor: "otp", context })).rejects.toBeInstanceOf(AuthenticationFailedError);
  });

  it("credenciais invalidas continuam recusadas antes de tocar o repositorio", async () => {
    const rejectingCredentials = { check: vi.fn().mockResolvedValue(false) } as unknown as LoginCredentialChecker;
    const repo = fakeAuthenticationRepository();
    const usecase = new StartLoginUseCase(users(), rejectingCredentials, allowingLimiter, otp, repo, new FixedClock(), new FixedSecrets(), limits, sign, true);

    await expect(usecase.execute({ email: "user@example.test", password: "senha", secondFactor: "otp", context })).rejects.toBeInstanceOf(AuthenticationFailedError);
  });
});
