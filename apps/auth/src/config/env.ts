import { z } from "zod";

export { loadRootEnv } from "./load-env";

export type EnvSource = Readonly<Record<string, string | undefined>>;

export interface RuntimeEnv {
  nodeEnv: "development" | "test" | "production";
  host: string;
  port: number;
  databaseUrl: string;
  issuer: string;
  audience: string;
  publicUrl: URL;
  webAppUrl: URL;
  keyEncryptionKey: Buffer;
  passwordBlocklistTimeoutMs: number;
  limits: {
    passwordEmail: { attempts: number; windowSeconds: number };
    passwordIp: { attempts: number; windowSeconds: number };
  };
}

const runtimeKeys = [
  "NODE_ENV", "AUTH_PORT", "AUTH_HOST", "AUTH_DATABASE_URL", "AUTH_ISSUER", "AUTH_AUDIENCE",
  "AUTH_PUBLIC_URL", "AUTH_WEB_APP_URL", "AUTH_KEY_ENCRYPTION_KEY",
  "AUTH_PASSWORD_BLOCKLIST_TIMEOUT_MS", "AUTH_PASSWORD_EMAIL_LIMIT", "AUTH_PASSWORD_IP_LIMIT",
  "AUTH_PASSWORD_WINDOW_SECONDS",
] as const;

const boolean = z.enum(["true", "false"]).transform((value) => value === "true");
const positiveInteger = z.coerce.number().int().positive();
const nonEmpty = z.string().trim().min(1);

const runtimeSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  AUTH_PORT: positiveInteger.default(3002),
  AUTH_HOST: nonEmpty.default("127.0.0.1"),
  AUTH_DATABASE_URL: nonEmpty,
  AUTH_ISSUER: nonEmpty,
  AUTH_AUDIENCE: nonEmpty.default("timeline-api"),
  AUTH_PUBLIC_URL: nonEmpty,
  AUTH_WEB_APP_URL: nonEmpty,
  AUTH_KEY_ENCRYPTION_KEY: nonEmpty,
  AUTH_PASSWORD_BLOCKLIST_TIMEOUT_MS: positiveInteger.default(2000),
  AUTH_PASSWORD_EMAIL_LIMIT: positiveInteger.default(5),
  AUTH_PASSWORD_IP_LIMIT: positiveInteger.default(30),
  AUTH_PASSWORD_WINDOW_SECONDS: positiveInteger.default(900),
}).strict();

function selected(source: EnvSource, keys: readonly string[]): Record<string, string | undefined> {
  return Object.fromEntries(keys.map((key) => [key, source[key] || undefined]));
}

function parseUrl(value: string, name: string): URL {
  try {
    return new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute URL`);
  }
}

function parseCanonicalKey(value: string): Buffer {
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) {
    throw new Error("AUTH_KEY_ENCRYPTION_KEY must be canonical 32-byte base64url");
  }
  const key = Buffer.from(value, "base64url");
  if (key.length !== 32 || key.toString("base64url") !== value) {
    throw new Error("AUTH_KEY_ENCRYPTION_KEY must be canonical 32-byte base64url");
  }
  return key;
}

export function getRuntimeEnv(source: EnvSource): RuntimeEnv {
  const raw = runtimeSchema.parse(selected(source, runtimeKeys));
  const keyEncryptionKey = parseCanonicalKey(raw.AUTH_KEY_ENCRYPTION_KEY);
  const limits = Object.freeze({
    passwordEmail: Object.freeze({ attempts: raw.AUTH_PASSWORD_EMAIL_LIMIT, windowSeconds: raw.AUTH_PASSWORD_WINDOW_SECONDS }),
    passwordIp: Object.freeze({ attempts: raw.AUTH_PASSWORD_IP_LIMIT, windowSeconds: raw.AUTH_PASSWORD_WINDOW_SECONDS }),
  });

  return Object.freeze({
    nodeEnv: raw.NODE_ENV,
    host: raw.AUTH_HOST,
    port: raw.AUTH_PORT,
    databaseUrl: raw.AUTH_DATABASE_URL,
    issuer: raw.AUTH_ISSUER,
    audience: raw.AUTH_AUDIENCE,
    publicUrl: parseUrl(raw.AUTH_PUBLIC_URL, "AUTH_PUBLIC_URL"),
    webAppUrl: parseUrl(raw.AUTH_WEB_APP_URL, "AUTH_WEB_APP_URL"),
    keyEncryptionKey,
    passwordBlocklistTimeoutMs: raw.AUTH_PASSWORD_BLOCKLIST_TIMEOUT_MS,
    limits,
  });
}

export function getMigrationEnv(source: EnvSource): { databaseMigrationUrl: string } {
  const databaseMigrationUrl = source.AUTH_DATABASE_MIGRATION_URL;
  if (!databaseMigrationUrl) throw new Error("AUTH_DATABASE_MIGRATION_URL is required for migrations");
  return Object.freeze({ databaseMigrationUrl });
}

export function getTestDatabaseUrl(source: EnvSource): string | undefined {
  const value = source.AUTH_TEST_DATABASE_URL;
  if (!value) return undefined;
  if (source.NODE_ENV !== "test") throw new Error("AUTH_TEST_DATABASE_URL is allowed only in test");
  return value;
}
