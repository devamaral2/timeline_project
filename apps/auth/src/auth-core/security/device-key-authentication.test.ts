import { describe, expect, it } from "vitest";
import type { DeviceKeyIdentity } from "../../domain/device-keys/device-key";
import { authenticateDeviceKey, type DeviceKeyAuthenticator } from "./device-key-authentication";

const identity: DeviceKeyIdentity = {
  keyId: "key-1",
  userId: "user-1",
  permission: "transcription:work",
};

const requestWith = (authorization: string | undefined) => ({
  header: (name: string) => (name === "authorization" ? authorization : undefined),
});

describe("device key authentication", () => {
  it("returns the identity of a valid device key", async () => {
    const authenticator: DeviceKeyAuthenticator = { execute: async (key) => (key === "bdk_valid" ? identity : null) };

    await expect(authenticateDeviceKey(requestWith("Bearer bdk_valid"), authenticator)).resolves.toEqual(identity);
  });

  it("refuses a key that is unknown, revoked or inactive", async () => {
    const authenticator: DeviceKeyAuthenticator = { execute: async () => null };

    await expect(authenticateDeviceKey(requestWith("Bearer bdk_gone"), authenticator)).rejects.toMatchObject({
      internalReason: "unknown, revoked or inactive device key",
    });
  });

  it.each([
    ["no credential", undefined],
    ["a non-bearer credential", "Basic dXNlcjpwYXNz"],
    ["an empty bearer", "Bearer "],
  ])("refuses %s before touching the repository", async (_label, authorization) => {
    let calls = 0;
    const authenticator: DeviceKeyAuthenticator = {
      execute: async () => {
        calls += 1;
        return identity;
      },
    };

    await expect(authenticateDeviceKey(requestWith(authorization), authenticator)).rejects.toMatchObject({
      internalReason: "missing device key",
    });
    expect(calls).toBe(0);
  });
});
