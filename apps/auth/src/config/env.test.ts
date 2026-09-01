import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  getMigrationEnv,
  getRuntimeEnv,
  getTestDatabaseUrl,
  loadRootEnv,
  type EnvSource,
} from "./env";

const kek = randomBytes(32).toString("base64url");
const base = (overrides: EnvSource = {}): EnvSource => ({
  NODE_ENV: "test",
  AUTH_DATABASE_URL: "postgres://runtime",
  AUTH_ISSUER: "https://auth.example.test",
  AUTH_PUBLIC_URL: "https://auth.example.test",
  AUTH_WEB_APP_URL: "https://web.example.test",
  AUTH_KEY_ENCRYPTION_KEY: kek,
  AUTH_OTP_PROVIDER: "fake",
  AUTH_ALLOW_FAKE_OTP: "true",
  ...overrides,
});

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true });
});

describe("auth environment", () => {
  it("prioritizes shell values over .env.local and .env.local over .env", () => {
    const directory = mkdtempSync(join(tmpdir(), "auth-env-"));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, ".env"), "AUTH_PORT=4000\nAUTH_DATABASE_URL=postgres://env\n");
    writeFileSync(join(directory, ".env.local"), "AUTH_PORT=4001\nAUTH_DATABASE_URL=postgres://local\n");

    const loaded = loadRootEnv(directory, { AUTH_PORT: "4002" });

    expect(loaded.AUTH_PORT).toBe("4002");
    expect(loaded.AUTH_DATABASE_URL).toBe("postgres://local");
  });

  it("uses the documented runtime defaults and fixed attempt window", () => {
    const env = getRuntimeEnv(base());

    expect(env.host).toBe("127.0.0.1");
    expect(env.port).toBe(3002);
    expect(env.audience).toBe("timeline-api");
    expect(env.twilioTimeoutMs).toBe(5000);
    expect(env.passwordBlocklistTimeoutMs).toBe(2000);
    expect(env.limits).toEqual({
      passwordEmail: { attempts: 5, windowSeconds: 900 },
      passwordIp: { attempts: 30, windowSeconds: 900 },
      mfaSendUser: { attempts: 3, windowSeconds: 600 },
      factorCheckAttempt: { attempts: 5, windowSeconds: 600 },
    });
  });

  it("accepts only a canonical 32-byte base64url KEK", () => {
    expect(() => getRuntimeEnv(base({ AUTH_KEY_ENCRYPTION_KEY: randomBytes(31).toString("base64url") }))).toThrow();
    expect(() => getRuntimeEnv(base({ AUTH_KEY_ENCRYPTION_KEY: `${kek}=` }))).toThrow();
    expect(getRuntimeEnv(base()).keyEncryptionKey).toEqual(Buffer.from(kek, "base64url"));
  });

  it.each([
    { NODE_ENV: "production", AUTH_HOST: "127.0.0.1", AUTH_ALLOW_FAKE_OTP: "true" },
    { NODE_ENV: "test", AUTH_HOST: "0.0.0.0", AUTH_ALLOW_FAKE_OTP: "true" },
    { NODE_ENV: "test", AUTH_HOST: "127.0.0.1", AUTH_ALLOW_FAKE_OTP: "false" },
  ])("rejects fake OTP outside its explicitly local conditions: %#", (overrides) => {
    expect(() => getRuntimeEnv(base(overrides))).toThrow();
  });

  it("requires every Twilio secret when Twilio is selected", () => {
    expect(() => getRuntimeEnv(base({ AUTH_OTP_PROVIDER: "twilio", AUTH_ALLOW_FAKE_OTP: "false" }))).toThrow();
    expect(
      getRuntimeEnv(
        base({
          AUTH_OTP_PROVIDER: "twilio",
          AUTH_ALLOW_FAKE_OTP: "false",
          TWILIO_ACCOUNT_SID: "ACexample",
          TWILIO_AUTH_TOKEN: "token",
          TWILIO_VERIFY_SERVICE_SID: "VAexample",
        }),
      ).twilioAccountSid,
    ).toBe("ACexample");
  });

  it("rejects WhatsApp as an input when it is disabled", () => {
    const env = getRuntimeEnv(base());

    expect(() => env.assertOtpChannelEnabled("whatsapp")).toThrow();
  });

  it("keeps migration and test credentials out of runtime configuration", () => {
    const source = base({ AUTH_DATABASE_MIGRATION_URL: "postgres://migration" });
    const runtime = getRuntimeEnv(source);

    expect(runtime).not.toHaveProperty("databaseMigrationUrl");
    expect(getMigrationEnv(source)).toEqual({ databaseMigrationUrl: "postgres://migration" });
    expect(() => getMigrationEnv(base())).toThrow();
    expect(getTestDatabaseUrl(base())).toBeUndefined();
    expect(getTestDatabaseUrl(base({ AUTH_TEST_DATABASE_URL: "postgres://test" }))).toBe("postgres://test");
    expect(() => getTestDatabaseUrl(base({ NODE_ENV: "development", AUTH_TEST_DATABASE_URL: "postgres://test" }))).toThrow();
  });
});
