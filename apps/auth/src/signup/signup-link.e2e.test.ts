import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { ConflictError, NotFoundError } from "../common/errors";
import { Clock } from "../common/clock";
import { SecretGenerator } from "../common/secret-generator";
import { verifyJwt } from "../crypto/jwt";
import { SigningKeyService } from "../crypto/signing-key.service";
import { createAuthDatabase, type AuthDatabase } from "../db/client";
import { AUTH_DATABASE } from "../db/tokens";
import { parseBootstrapArgs } from "../cli/bootstrap-admin.cli";
import { createTestApp, type TestApp } from "../testing/create-test-app";
import { createPostgresTestDatabase, describeWithPostgres, type PostgresTestDatabase } from "../testing/postgres-test-database";
import { PostgresSignupTokenRepository } from "./postgres-signup-token.repository";
import { CreateSignupLinkUseCase } from "./usecases/create-signup-link.usecase";

let fixture: PostgresTestDatabase | undefined;
let app: TestApp | undefined;
afterEach(async () => {
  await app?.close(); app = undefined;
  await fixture?.close(); fixture = undefined;
});

const ISSUER = "https://auth.example.test";
const tokenOf = (link: string) => new URLSearchParams(new URL(link).hash.slice(1)).get("token")!;

async function boot() {
  fixture = await createPostgresTestDatabase();
  app = await createTestApp({ AUTH_DATABASE_URL: fixture.runtimeUrl });
  const keys = app.app.get(SigningKeyService);
  const db = app.app.get<AuthDatabase>(AUTH_DATABASE);
  const usecase = new CreateSignupLinkUseCase(new PostgresSignupTokenRepository(db), keys, app.app.get(Clock), app.app.get(SecretGenerator), {
    issuer: ISSUER, audience: "timeline-api", webAppUrl: new URL("https://web.example.test"),
  });
  return { keys, db, usecase };
}

describe("parseBootstrapArgs", () => {
  it("takes no arguments to create, or --reissue USER_ID, and nothing else", () => {
    expect(parseBootstrapArgs([])).toEqual({});
    expect(parseBootstrapArgs(["--reissue", "01ABC"])).toEqual({ reissueUserId: "01ABC" });
    for (const argv of [["--email", "a@example.test"], ["--reissue"], ["--reissue", ""], ["extra"]]) {
      expect(() => parseBootstrapArgs(argv)).toThrow(/usage/);
    }
  });
});

describeWithPostgres("signup link", () => {
  it("creates the placeholder and a one-hour signup JWT whose jti is persisted", async () => {
    const { keys, db, usecase } = await boot();
    await keys.ensureActive(new Date());

    const result = await usecase.execute();

    expect(result.outcome).toBe("created");
    expect(result.link.startsWith("https://web.example.test/signup#token=")).toBe(true);
    const token = tokenOf(result.link);
    const jwks = keys.publicJwks().keys;
    const claims = verifyJwt(token, jwks, ISSUER, "timeline-api", new Date(), ["signup"]);
    expect(claims).toMatchObject({ sub: result.userId, token_use: "signup" });
    expect(claims.exp - claims.iat).toBe(3600);
    expect(result.expiresAt.getTime()).toBe(claims.exp * 1000);

    const user = (await db.query("SELECT name, status, email, phone, password_hash FROM users WHERE id = $1", [result.userId])).rows[0];
    expect(user).toMatchObject({ status: "pending_sign_up", email: null, phone: null, password_hash: null });
    expect(user.name).toMatch(/^admin_[0-9a-f]{8}$/);
    expect((await db.query("SELECT jti FROM signup_tokens WHERE user_id = $1 AND consumed_at IS NULL AND revoked_at IS NULL", [result.userId])).rows).toEqual([{ jti: claims.jti }]);
    expect(JSON.stringify((await db.query("SELECT * FROM signup_tokens")).rows)).not.toContain(token);
  });

  it("is refused with a typed 403 on every bearer route that exists today", async () => {
    const { keys, usecase } = await boot();
    await keys.ensureActive(new Date());
    const token = tokenOf((await usecase.execute()).link);

    for (const [method, path] of [["GET", "/auth/me"], ["POST", "/auth/logout-all"]] as const) {
      const response = await fetch(`${app!.url}${path}`, { method, headers: { authorization: `Bearer ${token}` } });
      expect([path, response.status]).toEqual([path, 403]);
    }
  });

  it("reissues for the same placeholder, killing the previous link, and refuses unknown or completed users", async () => {
    const { keys, db, usecase } = await boot();
    await keys.ensureActive(new Date());
    const first = await usecase.execute();
    const firstJti = verifyJwt(tokenOf(first.link), keys.publicJwks().keys, ISSUER, "timeline-api", new Date(), ["signup"]).jti;

    const second = await usecase.execute({ reissueUserId: first.userId });

    expect(second).toMatchObject({ outcome: "reissued", userId: first.userId });
    expect((await db.query("SELECT count(*)::int AS count FROM users WHERE status = 'pending_sign_up'")).rows[0]).toEqual({ count: 1 });
    const tokens = (await db.query<{ jti: string; revoked: boolean }>("SELECT jti, revoked_at IS NOT NULL AS revoked FROM signup_tokens WHERE user_id = $1", [first.userId])).rows;
    expect(tokens).toHaveLength(2);
    expect(tokens.find((row) => row.jti === firstJti)?.revoked).toBe(true);

    await expect(usecase.execute({ reissueUserId: "01NOPE0000000000000000000" })).rejects.toBeInstanceOf(NotFoundError);
    await db.query("UPDATE users SET status = 'active', email = 'done@example.test', password_hash = 'h' WHERE id = $1", [first.userId]);
    await expect(usecase.execute({ reissueUserId: first.userId })).rejects.toBeInstanceOf(ConflictError);
  });

  it("runs the real CLI on a freshly migrated database that was never booted", async () => {
    fixture = await createPostgresTestDatabase();
    const root = resolve(__dirname, "../../../..");
    const { stdout } = await promisify(execFile)(resolve(root, "node_modules/.bin/tsx"), [resolve(__dirname, "../cli/bootstrap-admin.cli.ts")], {
      cwd: resolve(__dirname, "../.."),
      env: {
        PATH: process.env.PATH,
        NODE_ENV: "test",
        AUTH_DATABASE_URL: fixture.runtimeUrl,
        AUTH_ISSUER: ISSUER,
        AUTH_PUBLIC_URL: ISSUER,
        AUTH_WEB_APP_URL: "https://web.example.test",
        AUTH_KEY_ENCRYPTION_KEY: randomBytes(32).toString("base64url"),
      },
    });

    const output = Object.fromEntries(stdout.trim().split("\n").map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]));
    expect(output).toMatchObject({ outcome: "created", userId: expect.any(String), link: expect.stringContaining("/signup#token=") });
    const db = createAuthDatabase({ connectionString: fixture.runtimeUrl });
    try {
      expect((await db.query("SELECT count(*)::int AS count FROM signing_keys WHERE status = 'active'")).rows[0]).toEqual({ count: 1 });
      expect((await db.query("SELECT status FROM users WHERE id = $1", [output.userId])).rows[0]).toEqual({ status: "pending_sign_up" });
    } finally {
      await db.close();
    }
  }, 60_000);
});
