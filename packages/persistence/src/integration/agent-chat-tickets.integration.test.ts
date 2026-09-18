import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { PostgresAgentChatTicketStore } from "../agent-chat/postgres-agent-chat-ticket.store";
import { createPostgresTestContext, type PostgresTestContext } from "../testing/postgres-test-context";

const RUN_INTEGRATION = process.env.RUN_POSTGRES_INTEGRATION === "1";

const grant = {
  actor: { userId: "admin-1", roles: ["admin"], permissions: ["*:manage"], denies: [] },
  targetUserId: "user-1",
};
const hash = (seed: string) => seed.repeat(64).slice(0, 64);

describe.runIf(RUN_INTEGRATION)("PostgresAgentChatTicketStore", () => {
  let ctx: PostgresTestContext;
  let store: PostgresAgentChatTicketStore;

  beforeEach(async () => {
    if (!ctx) {
      ctx = await createPostgresTestContext();
      store = new PostgresAgentChatTicketStore(ctx.db);
    } else {
      await ctx.reset();
    }
  }, 30000);

  afterAll(async () => {
    if (ctx) await ctx.stop();
  });

  test("a ticket hands back its grant exactly once", async () => {
    await store.save({ tokenHash: hash("a"), grant, ttlSeconds: 30 });

    expect(await store.consume(hash("a"))).toEqual(grant);
    expect(await store.consume(hash("a"))).toBeNull();
  });

  test("an unknown ticket is refused", async () => {
    expect(await store.consume(hash("b"))).toBeNull();
  });

  test("an expired ticket is refused and still burned", async () => {
    await store.save({ tokenHash: hash("c"), grant, ttlSeconds: 30 });
    await ctx.pool.query("UPDATE agent_chat_tickets SET expires_at = now() - interval '1 second'");

    expect(await store.consume(hash("c"))).toBeNull();
    const { rows } = await ctx.pool.query("SELECT count(*)::int AS count FROM agent_chat_tickets");
    expect(rows[0].count).toBe(0);
  });

  test("issuing a ticket purges the ones that expired a while ago", async () => {
    await store.save({ tokenHash: hash("d"), grant, ttlSeconds: 30 });
    await store.save({ tokenHash: hash("e"), grant, ttlSeconds: 30 });
    await ctx.pool.query(
      `UPDATE agent_chat_tickets SET expires_at = now() - interval '10 minutes' WHERE token_hash = $1`,
      [hash("d")],
    );

    await store.save({ tokenHash: hash("f"), grant, ttlSeconds: 30 });

    const { rows } = await ctx.pool.query("SELECT token_hash FROM agent_chat_tickets ORDER BY token_hash");
    expect(rows.map((row) => row.token_hash)).toEqual([hash("e"), hash("f")]);
  });
});
