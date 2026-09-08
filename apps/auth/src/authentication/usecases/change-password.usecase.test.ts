import { describe, expect, it, vi } from "vitest";
import { ChangePasswordUseCase } from "./change-password.usecase";
import { Clock } from "../../common/clock";
import { SecretGenerator } from "../../common/secret-generator";
import { AuthenticationFailedError, RequiredDependencyUnavailableError, SemanticInputError } from "../../common/errors";
import { PreparePassword } from "../../credentials/prepare-password";
import { hashSecretToken } from "../../crypto/secret-token";
import type { ChangePasswordWithStepUpCommand } from "../../mfa/ports/authentication-repository";
import { fakeAuthenticationRepository } from "../../testing/authentication-repository.double";
import type { AuthenticatedActor, User } from "../../users/user";
import type { UserReader } from "../../users/ports/user-repository";

const now = new Date("2026-09-04T12:00:00.000Z");
const context = { correlationId: "test", ipAddress: "127.0.0.1", userAgent: "vitest" };
const actor: AuthenticatedActor = { userId: "user", sessionId: "session", roles: ["member"], permissions: [], denies: [], amr: ["pwd", "otp"], authTime: 0 };
class FixedClock extends Clock { now(): Date { return now; } }
class FixedSecrets extends SecretGenerator { private id = 0; randomId(): string { return `id-${++this.id}`; } randomBytes(length: number): Buffer { return Buffer.alloc(length, 3); } }
const user: User = { id: "user", email: "user@example.test", name: "User", passwordHash: "old", status: "active", createdAt: now, updatedAt: now };
function users(value: User | null = user): UserReader { return { findById: vi.fn().mockResolvedValue(value), findByEmail: vi.fn() }; }

function preparePassword(overrides: { compromised?: boolean; unavailable?: boolean } = {}) {
  const pwned = { isCompromised: vi.fn().mockImplementation(async () => { if (overrides.unavailable) throw new RequiredDependencyUnavailableError("password blocklist unavailable"); return overrides.compromised ?? false; }) };
  const hasher = { hash: vi.fn().mockResolvedValue("scrypt$hash"), verify: vi.fn() };
  return { prepare: new PreparePassword(pwned, hasher), pwned, hasher };
}

const committed = { userId: "user", sessionId: "id-1", accessToken: "access", refreshTokenExpiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000), access: { roleKeys: ["member"], permissions: [], denies: [] } };

describe("ChangePasswordUseCase", () => {
  it("hashes outside the transaction and returns only the new token pair", async () => {
    const changePasswordWithStepUp = vi.fn().mockResolvedValue(committed);
    const { prepare, hasher } = preparePassword();
    const usecase = new ChangePasswordUseCase(users(), fakeAuthenticationRepository({ changePasswordWithStepUp }), prepare, new FixedClock(), new FixedSecrets(), () => "signed");

    const result = await usecase.execute({ actor, stepUpToken: "opaque", newPassword: "correct horse battery staple", context });

    expect(Object.keys(result).sort()).toEqual(["accessToken", "accessTokenExpiresInSeconds", "refreshToken", "refreshTokenExpiresAt"]);
    expect(result.accessTokenExpiresInSeconds).toBe(900);
    expect(hasher.hash).toHaveBeenCalledTimes(1);
    const command = changePasswordWithStepUp.mock.calls[0]![0] as ChangePasswordWithStepUpCommand;
    expect(command).toMatchObject({ userId: "user", originSessionId: "session", passwordHash: "scrypt$hash" });
    expect(command.attemptTokenHash).toBe(hashSecretToken("opaque"));
    expect(command.newSession.refreshToken.hash).toBe(hashSecretToken(result.refreshToken));
    // Nem a senha nova nem os segredos em claro atravessam a porta.
    expect(JSON.stringify(command)).not.toContain("correct horse battery staple");
    expect(JSON.stringify(command)).not.toContain(result.refreshToken);
    expect(command.auditEvents.map((event) => event.action)).toEqual(["step_up.consumed", "password.changed", "session.revoked_all", "session.issued"]);
  });

  it("leaves the step-up untouched when the blocklist is unreachable", async () => {
    const changePasswordWithStepUp = vi.fn();
    const { prepare } = preparePassword({ unavailable: true });
    const usecase = new ChangePasswordUseCase(users(), fakeAuthenticationRepository({ changePasswordWithStepUp }), prepare, new FixedClock(), new FixedSecrets(), () => "signed");

    await expect(usecase.execute({ actor, stepUpToken: "opaque", newPassword: "correct horse battery staple", context })).rejects.toBeInstanceOf(RequiredDependencyUnavailableError);
    expect(changePasswordWithStepUp).not.toHaveBeenCalled();
  });

  it("leaves the step-up untouched when the password is compromised", async () => {
    const changePasswordWithStepUp = vi.fn();
    const { prepare } = preparePassword({ compromised: true });
    const usecase = new ChangePasswordUseCase(users(), fakeAuthenticationRepository({ changePasswordWithStepUp }), prepare, new FixedClock(), new FixedSecrets(), () => "signed");

    await expect(usecase.execute({ actor, stepUpToken: "opaque", newPassword: "correct horse battery staple", context })).rejects.toBeInstanceOf(SemanticInputError);
    expect(changePasswordWithStepUp).not.toHaveBeenCalled();
  });

  it("fails opaquely when the transaction refuses the step-up", async () => {
    const { prepare } = preparePassword();
    const usecase = new ChangePasswordUseCase(users(), fakeAuthenticationRepository({ changePasswordWithStepUp: vi.fn().mockResolvedValue("invalid") }), prepare, new FixedClock(), new FixedSecrets(), () => "signed");

    await expect(usecase.execute({ actor, stepUpToken: "opaque", newPassword: "correct horse battery staple", context })).rejects.toBeInstanceOf(AuthenticationFailedError);
  });
});
