import { afterEach, expect, it } from "vitest";
import { ulid } from "ulid";
import { createAuthDatabase, type AuthDatabase } from "../db/client";
import { createPostgresTestDatabase, describeWithPostgres, type PostgresTestDatabase } from "../testing/postgres-test-database";
import { consumeSignupTokenInTransaction, PostgresSignupTokenRepository } from "./postgres-signup-token.repository";

let fixture: PostgresTestDatabase | undefined;
let db: AuthDatabase | undefined;
afterEach(async () => { await db?.close(); db = undefined; await fixture?.close(); fixture = undefined; });

const now = new Date();
const inAnHour = new Date(now.getTime() + 3600_000);
const token = (jti = ulid()) => ({ id: ulid(), jti, expiresAt: inAnHour });

async function open(): Promise<PostgresSignupTokenRepository> {
  fixture = await createPostgresTestDatabase();
  db = createAuthDatabase({ connectionString: fixture.runtimeUrl });
  return new PostgresSignupTokenRepository(db);
}

describeWithPostgres("PostgresSignupTokenRepository", () => {
  it("creates the pending_sign_up placeholder with no email, phone or password, plus its open token", async () => {
    const repository = await open();
    const userId = ulid();
    const first = token();
    await repository.createPendingAdmin({ userId, placeholderName: "admin_3f9a2c", token: first, now });

    expect((await db!.query("SELECT name, status, email, phone, password_hash FROM users WHERE id = $1", [userId])).rows[0]).toEqual({
      name: "admin_3f9a2c", status: "pending_sign_up", email: null, phone: null, password_hash: null,
    });
    expect((await db!.query("SELECT jti, consumed_at, revoked_at FROM signup_tokens WHERE user_id = $1", [userId])).rows).toEqual([
      { jti: first.jti, consumed_at: null, revoked_at: null },
    ]);
  });

  it("reissues by revoking the open token in the same commit, and only for a pending user", async () => {
    const repository = await open();
    const userId = ulid();
    const first = token();
    await repository.createPendingAdmin({ userId, placeholderName: "admin_aaaaaa", token: first, now });
    const second = token();

    expect(await repository.reissue({ userId, token: second, now })).toBe("reissued");
    const rows = (await db!.query<{ jti: string; revoked: boolean }>("SELECT jti, revoked_at IS NOT NULL AS revoked FROM signup_tokens WHERE user_id = $1 ORDER BY created_at, jti", [userId])).rows;
    expect(rows).toEqual(expect.arrayContaining([{ jti: first.jti, revoked: true }, { jti: second.jti, revoked: false }]));
    await expect(db!.transaction((tx) => consumeSignupTokenInTransaction(tx, { jti: first.jti, userId, now }))).resolves.toBe(false);

    expect(await repository.reissue({ userId: ulid(), token: token(), now })).toBe("not_found");
    await db!.query("UPDATE users SET status = 'active', email = 'a@example.test', password_hash = 'h' WHERE id = $1", [userId]);
    expect(await repository.reissue({ userId, token: token(), now })).toBe("not_pending");
  });

  it("consumes a token once, and never a revoked, expired or foreign one", async () => {
    const repository = await open();
    const userId = ulid();
    const first = token();
    await repository.createPendingAdmin({ userId, placeholderName: "admin_bbbbbb", token: first, now });
    const consume = (jti: string, owner = userId, at = now) => db!.transaction((tx) => consumeSignupTokenInTransaction(tx, { jti, userId: owner, now: at }));

    expect(await consume(first.jti, ulid())).toBe(false);
    expect(await consume(first.jti, userId, new Date(inAnHour.getTime() + 1000))).toBe(false);
    const [a, b] = await Promise.all([consume(first.jti), consume(first.jti)]);
    expect([a, b].sort()).toEqual([false, true]);

    const second = token();
    expect(await repository.reissue({ userId, token: second, now })).toBe("reissued");
    expect(await repository.revoke({ userId, now })).toBe(true);
    expect(await repository.revoke({ userId, now })).toBe(false);
    expect(await consume(second.jti)).toBe(false);
  });
});
