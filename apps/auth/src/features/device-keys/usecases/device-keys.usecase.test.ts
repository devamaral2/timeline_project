import { describe, expect, it } from "vitest";
import { ANONYMOUS_CONTEXT } from "../../../common/request-context";
import { CryptoSecretGenerator } from "../../../common/secret-generator";
import { InMemoryDeviceKeyRepository } from "../../../testing/in-memory-device-key.repository";
import type { User } from "../../../domain/users/user";
import { AuthenticateDeviceKeyUseCase } from "./authenticate-device-key.usecase";
import { IssueDeviceKeyUseCase } from "./issue-device-key.usecase";
import { RevokeDeviceKeyUseCase } from "./revoke-device-key.usecase";

const now = new Date("2026-11-26T12:00:00Z");
const clock = { now: () => now };
const owner: User = { id: "user-1", email: "dono@example.test", name: "Dono", passwordHash: null, status: "active", createdAt: now, updatedAt: now };

function setup(user: User | null = owner) {
  const keys = new InMemoryDeviceKeyRepository();
  const users = { findByEmail: async (email: string) => (user && user.email === email ? user : null), findById: async () => user };
  return {
    keys,
    issue: new IssueDeviceKeyUseCase(users, keys, clock, new CryptoSecretGenerator()),
    revoke: new RevokeDeviceKeyUseCase(keys, clock),
    authenticate: new AuthenticateDeviceKeyUseCase(keys, clock),
  };
}

describe("device keys", () => {
  it("authenticates a freshly issued key as its owner with the transcription permission only", async () => {
    const { issue, authenticate } = setup();
    const issued = await issue.execute({ email: "Dono@Example.test", label: "pc de casa", context: ANONYMOUS_CONTEXT });

    expect(issued.key.startsWith("bdk_")).toBe(true);
    await expect(authenticate.execute(issued.key)).resolves.toEqual({
      keyId: issued.keyId,
      userId: "user-1",
      permission: "transcription:work",
    });
  });

  it("stores only a hash of the key", async () => {
    const { issue, keys } = setup();
    const issued = await issue.execute({ email: owner.email, label: "pc", context: ANONYMOUS_CONTEXT });

    expect(JSON.stringify([...keys.keys.values()])).not.toContain(issued.key);
  });

  it("issues distinct keys on every call", async () => {
    const { issue } = setup();
    const a = await issue.execute({ email: owner.email, label: "a", context: ANONYMOUS_CONTEXT });
    const b = await issue.execute({ email: owner.email, label: "b", context: ANONYMOUS_CONTEXT });

    expect(a.key).not.toBe(b.key);
    expect(a.keyId).not.toBe(b.keyId);
  });

  it("refuses to issue a key for an unknown or inactive user", async () => {
    await expect(setup(null).issue.execute({ email: "x@example.test", label: "pc", context: ANONYMOUS_CONTEXT })).rejects.toThrow("active user not found");
    const suspended = setup({ ...owner, status: "suspended" });
    await expect(suspended.issue.execute({ email: owner.email, label: "pc", context: ANONYMOUS_CONTEXT })).rejects.toThrow("active user not found");
  });

  it("stops authenticating a revoked key, and revoking twice is harmless", async () => {
    const { issue, revoke, authenticate } = setup();
    const issued = await issue.execute({ email: owner.email, label: "pc", context: ANONYMOUS_CONTEXT });

    await expect(revoke.execute({ keyId: issued.keyId, context: ANONYMOUS_CONTEXT })).resolves.toBe("revoked");
    await expect(authenticate.execute(issued.key)).resolves.toBeNull();
    await expect(revoke.execute({ keyId: issued.keyId, context: ANONYMOUS_CONTEXT })).resolves.toBe("already_revoked");
  });

  it("reports an unknown key id on revoke", async () => {
    await expect(setup().revoke.execute({ keyId: "nope", context: ANONYMOUS_CONTEXT })).resolves.toBe("not_found");
  });

  it("does not authenticate an unknown key, a session token or an empty value", async () => {
    const { issue, authenticate } = setup();
    await issue.execute({ email: owner.email, label: "pc", context: ANONYMOUS_CONTEXT });

    await expect(authenticate.execute("bdk_desconhecida")).resolves.toBeNull();
    await expect(authenticate.execute("eyJhbGciOiJFUzI1NiJ9.e30.sig")).resolves.toBeNull();
    await expect(authenticate.execute("")).resolves.toBeNull();
  });
});
