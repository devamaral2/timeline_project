import { describe, expect, it } from "vitest";
import { AgentLimitReachedError, FastStageError, InvalidInputError, LlmUnavailableError } from "../errors/agent.errors";
import { TurnTrace } from "./turn-trace";

const identity = { jobId: "job-1", userId: "u1", actorId: "u1", attempt: 2, sinceSubmittedMs: 4_000, mode: "chat" as const };

describe("TurnTrace", () => {
  it("junta rota, decisao, etapas e ferramentas sem texto do usuario", async () => {
    const trace = new TurnTrace();
    trace.setRoute("save_meal_event");
    trace.setDecision({ source: "jev", latencyMs: 300, model: "jev-1.13.0" });
    await trace.time("agent", async () => "texto");
    await trace.tool("get_day_context", async () => ({ ok: true }));
    trace.setRun({ modelName: "modelo-x", stoppedByLimit: false });
    trace.setChanges(2);

    const record = trace.toRecord(identity);

    expect(record).toMatchObject({
      ...identity, route: "save_meal_event", rerouted: false, model: "modelo-x",
      outcome: "ok", errorCode: null, stoppedByLimit: false, changes: 2,
      routeDecision: { source: "jev", latencyMs: 300 },
    });
    expect(record.stages).toHaveProperty("agentMs");
    expect(record.stages).not.toHaveProperty("totalMs");
    expect(record.tools).toEqual([{ name: "get_day_context", ms: expect.any(Number), ok: true }]);
  });

  it("registra a ferramenta mesmo quando ela lanca e a marca como falha", async () => {
    const trace = new TurnTrace();

    await expect(trace.tool("query_data", async () => { throw new Error("sql"); })).rejects.toThrow("sql");
    await trace.tool("query_data", async () => ({ ok: false, error: "x" }));

    expect(trace.toRecord(identity).tools.map((call) => call.ok)).toEqual([false, false]);
  });

  it.each([
    [new LlmUnavailableError("x"), "unavailable", "LlmUnavailableError"],
    [new AgentLimitReachedError(), "limit_reached", "AgentLimitReachedError"],
    [new FastStageError("planner", "timeout"), "stage_failed", "FastStageError"],
    [new InvalidInputError("x"), "invalid_input", "InvalidInputError"],
    [new TypeError("boom"), "error", "TypeError"],
  ])("traduz o erro %s em desfecho", (error, outcome, code) => {
    const trace = new TurnTrace();
    trace.fail(error);

    expect(trace.toRecord(identity)).toMatchObject({ outcome, errorCode: code });
  });

  it("diferencia o pipeline rapido do legado e guarda por que o rapido nao cobriu o pedido", () => {
    const fast = new TurnTrace();
    fast.setPipeline("fast");
    const fellBack = new TurnTrace();
    fellBack.setPipeline("fast");
    fellBack.fallBackToLegacy("read");

    expect(new TurnTrace().toRecord(identity)).toMatchObject({ pipeline: "legacy", fastFallback: null });
    expect(fast.toRecord(identity)).toMatchObject({ pipeline: "fast", fastFallback: null });
    expect(fellBack.toRecord(identity)).toMatchObject({ pipeline: "legacy", fastFallback: "read" });
  });

  it("marca esclarecimento e novo roteamento", () => {
    const trace = new TurnTrace();
    trace.setRoute("complex", true);
    trace.markClarification();

    expect(trace.toRecord(identity)).toMatchObject({ outcome: "clarification", rerouted: true, route: "complex" });
  });
});
