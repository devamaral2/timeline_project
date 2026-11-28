import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { sql } from "@repo/sqlite";
import { SqliteIdempotencyStore } from "../idempotency/sqlite-idempotency.store";
import { createSqliteTestContext, type SqliteTestContext } from "../testing/sqlite-test-context";

const ref = { userId: "owner", scope: "/api/artifacts", key: "resumo:2026-11-03" };
const hash = (seed: string) => seed.repeat(64).slice(0, 64);

describe("SqliteIdempotencyStore", () => {
  let ctx: SqliteTestContext;
  let store: SqliteIdempotencyStore;

  beforeEach(async () => {
    if (!ctx) {
      ctx = await createSqliteTestContext();
      store = new SqliteIdempotencyStore(ctx.db);
    } else {
      await ctx.reset();
    }
  }, 30000);

  afterAll(async () => {
    if (ctx) await ctx.stop();
  });

  test("only one of two simultaneous claims runs", async () => {
    const claims = await Promise.all([
      store.claim({ ...ref, requestHash: hash("a") }),
      store.claim({ ...ref, requestHash: hash("a") }),
    ]);

    expect(claims.map((claim) => claim.kind).sort()).toEqual(["claimed", "in_progress"]);
  });

  test("a completed key replays its response", async () => {
    await store.claim({ ...ref, requestHash: hash("a") });
    await store.complete({ ...ref, response: { artifactId: "artifact-1" } });

    expect(await store.claim({ ...ref, requestHash: hash("a") })).toEqual({
      kind: "replay",
      response: { artifactId: "artifact-1" },
    });
  });

  test("the same key with another body is a mismatch", async () => {
    await store.claim({ ...ref, requestHash: hash("a") });

    expect(await store.claim({ ...ref, requestHash: hash("b") })).toEqual({ kind: "mismatch" });
  });

  test("releasing frees an unfinished key but never a completed one", async () => {
    await store.claim({ ...ref, requestHash: hash("a") });
    await store.release(ref);
    expect((await store.claim({ ...ref, requestHash: hash("a") })).kind).toBe("claimed");

    await store.complete({ ...ref, response: { artifactId: "artifact-1" } });
    await store.release(ref);
    expect((await store.claim({ ...ref, requestHash: hash("a") })).kind).toBe("replay");
  });

  test("an abandoned claim is taken over after two minutes", async () => {
    await store.claim({ ...ref, requestHash: hash("a") });
    await ctx.db.execute(sql`UPDATE idempotency_keys SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-3 minutes')`);

    expect((await store.claim({ ...ref, requestHash: hash("a") })).kind).toBe("claimed");
  });

  test("keys older than the retention window are purged on the next claim", async () => {
    await store.claim({ ...ref, requestHash: hash("a") });
    await store.complete({ ...ref, response: { artifactId: "artifact-1" } });
    await ctx.db.execute(sql`UPDATE idempotency_keys SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-31 days')`);

    expect((await store.claim({ ...ref, requestHash: hash("a") })).kind).toBe("claimed");
  });
});
