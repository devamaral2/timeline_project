import { afterAll, beforeAll, expect, test } from "vitest";
import type { TurnTraceRecord } from "../../../api-core/agent/services/turn-trace";
import { PostgresDatabase } from "../database/postgres-database";
import { createPostgresTestContext, type PostgresTestContext } from "../testing/postgres-test-context";
import { PostgresAiTurnTraceStore } from "./postgres-ai-turn-trace.store";

let postgres: PostgresTestContext;
let store: PostgresAiTurnTraceStore;

beforeAll(async () => {
  postgres = await createPostgresTestContext();
  store = new PostgresAiTurnTraceStore(new PostgresDatabase(postgres.pool));
}, 120000);
afterAll(async () => { await postgres?.stop(); }, 30000);

const trace: TurnTraceRecord = {
  jobId: "job-1", userId: "u1", actorId: "u1", attempt: 2, sinceSubmittedMs: 9000, mode: "chat", pipeline: "legacy", fastFallback: null,
  route: "complex", rerouted: false, model: "modelo-x", outcome: "unavailable", errorCode: "LlmUnavailableError",
  stoppedByLimit: false, changes: 0, totalMs: 120500,
  routeDecision: { source: "jev", latencyMs: 310, fallbackReason: "count_many" },
  stages: { routeMs: 310, agentMs: 120100, readsMs: 2000 },
  tools: [{ name: "get_day_context", ms: 800, ok: true }],
};

test("stores a failed attempt with its stages, tools and JEV fallback reason queryable by SQL", async () => {
  await store.record(trace);
  await store.record({ ...trace, jobId: null, attempt: null, sinceSubmittedMs: null, routeDecision: null, outcome: "ok", errorCode: null });

  const { rows } = await postgres.pool.query(
    `SELECT route_decision->>'fallbackReason' AS reason, (stages->>'agentMs')::int AS agent_ms, outcome, attempt
     FROM ai_turn_traces ORDER BY outcome DESC`,
  );
  expect(rows).toEqual([
    { reason: "count_many", agent_ms: 120100, outcome: "unavailable", attempt: 2 },
    { reason: null, agent_ms: 120100, outcome: "ok", attempt: null },
  ]);
  const tools = await postgres.pool.query(
    `SELECT t->>'name' AS name FROM ai_turn_traces, jsonb_array_elements(tools) t WHERE job_id='job-1'`,
  );
  expect(tools.rows).toEqual([{ name: "get_day_context" }]);
});
