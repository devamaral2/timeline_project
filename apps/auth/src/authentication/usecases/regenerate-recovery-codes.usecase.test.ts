import { describe, expect, it, vi } from "vitest";
import { RegenerateRecoveryCodesUseCase } from "./regenerate-recovery-codes.usecase";
import { Clock } from "../../common/clock";
import { SecretGenerator } from "../../common/secret-generator";
import { AuthenticationFailedError } from "../../common/errors";
import { hashRecoveryCode } from "../../mfa/recovery-code";
import { hashSecretToken } from "../../crypto/secret-token";
import type { RegenerateRecoveryCodesWithStepUpCommand } from "../../mfa/ports/authentication-repository";
import { fakeAuthenticationRepository } from "../../testing/authentication-repository.double";
import type { AuthenticatedActor } from "../../users/user";

const now = new Date("2026-09-04T12:00:00.000Z");
const context = { correlationId: "test", ipAddress: "127.0.0.1", userAgent: "vitest" };
const actor: AuthenticatedActor = { kind: "user", userId: "user", sessionId: "session", tokenId: "jti", roles: ["member"], permissions: [], denies: [] };
class FixedClock extends Clock { now(): Date { return now; } }
class CountingSecrets extends SecretGenerator { private id = 0; private byte = 0; randomId(): string { return `id-${++this.id}`; } randomBytes(length: number): Buffer { return Buffer.alloc(length, ++this.byte); } }

describe("RegenerateRecoveryCodesUseCase", () => {
  it("returns ten fresh codes once and sends only their hashes to the transaction", async () => {
    const regenerateRecoveryCodesWithStepUp = vi.fn().mockResolvedValue("regenerated");
    const usecase = new RegenerateRecoveryCodesUseCase(fakeAuthenticationRepository({ regenerateRecoveryCodesWithStepUp }), new FixedClock(), new CountingSecrets());

    const result = await usecase.execute({ actor, stepUpToken: "opaque", context });

    expect(result.recoveryCodes).toHaveLength(10);
    expect(new Set(result.recoveryCodes).size).toBe(10);
    const command = regenerateRecoveryCodesWithStepUp.mock.calls[0]![0] as RegenerateRecoveryCodesWithStepUpCommand;
    expect(command).toMatchObject({ userId: "user", originSessionId: "session" });
    expect(command.attemptTokenHash).toBe(hashSecretToken("opaque"));
    expect(command.recoveryCodes.map((code) => code.hash)).toEqual(result.recoveryCodes.map((code) => hashRecoveryCode(code.replace(/-/g, ""))));
    expect(command.auditEvents.map((event) => event.action)).toEqual(["step_up.consumed", "recovery.regenerated"]);
  });

  it("never asks the transaction to revoke sessions", async () => {
    const regenerateRecoveryCodesWithStepUp = vi.fn().mockResolvedValue("regenerated");
    const usecase = new RegenerateRecoveryCodesUseCase(fakeAuthenticationRepository({ regenerateRecoveryCodesWithStepUp }), new FixedClock(), new CountingSecrets());

    await usecase.execute({ actor, stepUpToken: "opaque", context });

    const command = regenerateRecoveryCodesWithStepUp.mock.calls[0]![0] as RegenerateRecoveryCodesWithStepUpCommand;
    expect(command).not.toHaveProperty("newSession");
    expect(command.auditEvents.some((event) => event.action.startsWith("session."))).toBe(false);
  });

  it("fails opaquely when the transaction refuses the step-up", async () => {
    const usecase = new RegenerateRecoveryCodesUseCase(fakeAuthenticationRepository({ regenerateRecoveryCodesWithStepUp: vi.fn().mockResolvedValue("invalid") }), new FixedClock(), new CountingSecrets());
    await expect(usecase.execute({ actor, stepUpToken: "opaque", context })).rejects.toBeInstanceOf(AuthenticationFailedError);
  });
});
