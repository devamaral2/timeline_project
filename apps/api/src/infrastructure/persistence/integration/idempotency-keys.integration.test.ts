import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { PostgresIdempotencyStore } from "../idempotency/postgres-idempotency.store";
import { createPostgresTestContext, type PostgresTestContext } from "../testing/postgres-test-context";

const ref = { userId: "owner", scope: "/api/notes", key: "resumo:2026-11-03" };
const hash = (seed: string) => seed.repeat(64).slice(0, 64);

describe("PostgresIdempotencyStore", () => {
  let ctx: PostgresTestContext;
  let store: PostgresIdempotencyStore;

  beforeEach(async () => {
    if (!ctx) {
      ctx = await createPostgresTestContext();
      store = new PostgresIdempotencyStore(ctx.db);
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
    await store.complete({ ...ref, response: { noteId: "note-1" } });

    expect(await store.claim({ ...ref, requestHash: hash("a") })).toEqual({
      kind: "replay",
      response: { noteId: "note-1" },
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

    await store.complete({ ...ref, response: { noteId: "note-1" } });
    await store.release(ref);
    expect((await store.claim({ ...ref, requestHash: hash("a") })).kind).toBe("replay");
  });

  test("an abandoned claim is taken over after two minutes", async () => {
    await store.claim({ ...ref, requestHash: hash("a") });
    await ctx.pool.query("UPDATE idempotency_keys SET created_at = now() - interval '3 minutes'");

    expect((await store.claim({ ...ref, requestHash: hash("a") })).kind).toBe("claimed");
  });

  test("keys older than the retention window are purged on the next claim", async () => {
    await store.claim({ ...ref, requestHash: hash("a") });
    await store.complete({ ...ref, response: { noteId: "note-1" } });
    await ctx.pool.query("UPDATE idempotency_keys SET created_at = now() - interval '31 days'");

    expect((await store.claim({ ...ref, requestHash: hash("a") })).kind).toBe("claimed");
  });
});
