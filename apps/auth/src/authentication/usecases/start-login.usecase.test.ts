import { describe, expect, it, vi } from "vitest";
import { StartLoginUseCase } from "./start-login.usecase";
import { Clock } from "../../common/clock";
import { SecretGenerator } from "../../common/secret-generator";
import { AuthenticationFailedError } from "../../common/errors";
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
const limits = { passwordEmail: { attempts: 5, windowSeconds: 900 }, passwordIp: { attempts: 30, windowSeconds: 900 } };
const sign = vi.fn().mockReturnValue("signed.jwt.token");

function usecase(repoOverrides: object = {}) {
  return new StartLoginUseCase(users(), acceptingCredentials, allowingLimiter, fakeAuthenticationRepository(repoOverrides), new FixedClock(), new FixedSecrets(), limits, sign);
}

describe("StartLoginUseCase", () => {
  it("emite a sessão diretamente após validar email e senha", async () => {
    const completeLogin = vi.fn().mockResolvedValue({ userId: "user", sessionId: "session", accessToken: "signed.jwt.token", refreshTokenExpiresAt: new Date(now.getTime() + 1000), access: { roleKeys: [], permissions: [], denies: [] } });
    const result = await usecase({ completeLogin }).execute({ email: "user@example.test", password: "senha", context });
    expect(result).toMatchObject({ accessToken: "signed.jwt.token", accessTokenExpiresInSeconds: expect.any(Number), refreshTokenExpiresAt: new Date(now.getTime() + 1000).toISOString() });
    expect(result).not.toHaveProperty("recoveryCodes");
    expect(completeLogin).toHaveBeenCalledWith(expect.objectContaining({ userId: "user", newSession: expect.objectContaining({ amr: ["pwd"] }) }), sign);
  });

  it("propaga falha quando o repositório recusa a sessão", async () => {
    await expect(usecase({ completeLogin: vi.fn().mockResolvedValue("invalid") }).execute({ email: "user@example.test", password: "senha", context })).rejects.toBeInstanceOf(AuthenticationFailedError);
  });

  it("recusa credenciais inválidas antes de tocar o repositório", async () => {
    const rejectingCredentials = { check: vi.fn().mockResolvedValue(false) } as unknown as LoginCredentialChecker;
    const repo = fakeAuthenticationRepository();
    const login = new StartLoginUseCase(users(), rejectingCredentials, allowingLimiter, repo, new FixedClock(), new FixedSecrets(), limits, sign);
    await expect(login.execute({ email: "user@example.test", password: "senha", context })).rejects.toBeInstanceOf(AuthenticationFailedError);
  });
});
