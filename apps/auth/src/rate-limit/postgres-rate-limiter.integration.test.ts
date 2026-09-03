import { Pool } from "pg";
import { afterEach, expect, it } from "vitest";
import { rateLimitSubjectHash } from "./rate-limit-key";
import { PostgresRateLimiter } from "./postgres-rate-limiter";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../testing/postgres-test-database";

let fixture: PostgresTestDatabase | undefined;
let pool: Pool | undefined;
afterEach(async () => { await pool?.end(); await fixture?.close(); pool = undefined; fixture = undefined; });

it("derives a scoped non-reversible rate limit subject hash", () => {
  const key = Buffer.alloc(32, 7);
  expect(rateLimitSubjectHash(key, "password_email", "a@example.test"))
    .not.toBe(rateLimitSubjectHash(key, "password_ip", "a@example.test"));
});

const run = process.env.AUTH_TEST_DATABASE_URL ? it : it.skip;
run("counts concurrent hits atomically and resets exactly at the window boundary", async () => {
  fixture = await createPostgresTestDatabase(); pool = new Pool({ connectionString: fixture.runtimeUrl, max: 2 });
  const limiter = new PostgresRateLimiter(pool, Buffer.alloc(32, 3)); const start = new Date("2026-09-01T00:00:00.000Z");
  const hits = await Promise.all(Array.from({ length: 3 }, () => limiter.hit({ scope: "password_email", subject: "user@example.test", limit: 2, windowSeconds: 60, now: start })));
  expect(hits.filter(({ allowed }) => allowed)).toHaveLength(2);
  expect(hits.find(({ allowed }) => !allowed)?.retryAfterSeconds).toBe(60);
  await expect(limiter.hit({ scope: "password_email", subject: "user@example.test", limit: 2, windowSeconds: 60, now: new Date(start.getTime() + 60_000) })).resolves.toEqual({ allowed: true, retryAfterSeconds: 0 });
});
