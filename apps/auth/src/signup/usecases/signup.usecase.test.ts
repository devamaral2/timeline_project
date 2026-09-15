import { describe, expect, it, vi } from "vitest";
import { Clock } from "../../common/clock";
import { AuthenticationFailedError, ConflictError, RateLimitedError, SemanticInputError } from "../../common/errors";
import { SecretGenerator } from "../../common/secret-generator";
import { PreparePassword } from "../../credentials/prepare-password";
import type { SignupRepository } from "../ports/signup-repository";
import { SignupUseCase } from "./signup.usecase";

const now = new Date("2026-09-13T12:00:00.000Z");
class FixedClock extends Clock { now(): Date { return now; } }
class FixedSecrets extends SecretGenerator { private id = 0; randomId(): string { return `id-${++this.id}`; } randomBytes(length: number): Buffer { return Buffer.alloc(length, 5); } }
const actor = { kind: "signup" as const, userId: "pending-1", tokenId: "jti-1" };
const context = { correlationId: "c", ipAddress: "198.51.100.4", userAgent: null };
const input = { actor, email: " Ana@Example.test ", phone: "+5511999990000", name: " Ana ", password: "Senha-Forte-123", context };

function build(options: { allowed?: boolean; outcome?: Awaited<ReturnType<SignupRepository["completeSignup"]>> } = {}) {
  const hasher = { hash: vi.fn().mockResolvedValue("scrypt$hash"), verify: vi.fn() };
  const completeSignup = vi.fn().mockResolvedValue(options.outcome ?? { kind: "completed", session: { sessionId: "s", accessToken: "user.jwt", access: { roleKeys: ["admin"], permissions: ["*:manage"], denies: [] }, refreshTokenExpiresAt: now } });
  const hit = vi.fn().mockResolvedValue({ allowed: options.allowed ?? true, retryAfterSeconds: 60 });
  const usecase = new SignupUseCase({ completeSignup }, new PreparePassword(hasher), { hit }, () => "signed", new FixedClock(), new FixedSecrets(), { attempts: 30, windowSeconds: 900 });
  return { usecase, hasher, completeSignup, hit };
}

describe("SignupUseCase", () => {
  it("throttles by IP before hashing, and hashes nothing once limited", async () => {
    const { usecase, hasher, completeSignup, hit } = build({ allowed: false });
    await expect(usecase.execute(input)).rejects.toBeInstanceOf(RateLimitedError);
    expect(hit).toHaveBeenCalledWith(expect.objectContaining({ scope: "signup_ip", subject: "198.51.100.4" }));
    expect(hasher.hash).not.toHaveBeenCalled();
    expect(completeSignup).not.toHaveBeenCalled();
  });

  it("passes the normalized submitted values and the token jti to one transaction", async () => {
    const { usecase, completeSignup } = build();
    const result = await usecase.execute(input);
    expect(completeSignup).toHaveBeenCalledWith(expect.objectContaining({ userId: "pending-1", tokenJti: "jti-1", email: "ana@example.test", name: "Ana", phone: "+5511999990000", passwordHash: "scrypt$hash" }), expect.any(Function));
    expect(result).toMatchObject({ userId: "pending-1", accessToken: "user.jwt", accessTokenExpiresInSeconds: 900 });
    expect(JSON.stringify(completeSignup.mock.calls[0]![0])).not.toContain("Senha-Forte-123");
  });

  it("refuses a password equal to the submitted email before touching the database", async () => {
    const { usecase, completeSignup } = build();
    await expect(usecase.execute({ ...input, email: "Senha-Forte-123@x.io", password: "senha-forte-123@x.io" })).rejects.toBeInstanceOf(SemanticInputError);
    expect(completeSignup).not.toHaveBeenCalled();
  });

  it.each([
    [{ kind: "invalid" as const }, AuthenticationFailedError],
    [{ kind: "email_taken" as const }, ConflictError],
    [{ kind: "phone_taken" as const }, ConflictError],
  ])("maps %o to its error", async (outcome, error) => {
    await expect(build({ outcome }).usecase.execute(input)).rejects.toBeInstanceOf(error);
  });
});
