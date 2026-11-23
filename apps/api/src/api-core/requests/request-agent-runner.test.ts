import { describe, expect, test } from "vitest";
import { z } from "zod";
import { FastStageError } from "../agent/errors/agent.errors";
import { RequestAgentRunner } from "./request-agent-runner";
import { loadAgentDefinition } from "./request-config";
import { InMemoryRequestStore } from "./testing/in-memory-request-store";
import { NOW, ScriptedStructuredGateway } from "./testing/request-test-kit";

const schema = z.object({ sql: z.string() });

function setup(options: { reasoning?: "low" | "medium" | "high" } = {}) {
  const store = new InMemoryRequestStore(() => NOW);
  store.seed({ id: "r1", prompt: "pedido" });
  const gateway = new ScriptedStructuredGateway();
  gateway.outputs.set("query", { sql: "select 1" });
  const runner = new RequestAgentRunner(gateway, { thoughts: store, clock: () => NOW, ...options });
  const run = (think = true) => runner.run({ agent: "query", now: NOW, user: "pedido", schema, stepId: "s1", think });
  return { store, gateway, run, runner };
}

describe("RequestAgentRunner", () => {
  test("without reasoning, the call keeps the agent's budget and asks for none", async () => {
    const { store, gateway, run } = setup();
    await store.beginSteps("r1", [{ id: "s1", agent: "query", expected: "one" }]);

    expect(await run()).toEqual({ value: { sql: "select 1" }, modelName: "stub" });

    const { timeoutMs, attemptMs } = loadAgentDefinition("query");
    expect(gateway.calls[0]).toMatchObject({ timeoutMs, attemptMs });
    expect(gateway.calls[0]).not.toHaveProperty("reasoning");
    expect((await store.steps("r1"))[0]?.thoughts).toBeUndefined();
  });

  test("a call that does not ask to think gets no reasoning, whatever the runner's effort", async () => {
    const { store, gateway, run } = setup({ reasoning: "low" });
    await store.beginSteps("r1", [{ id: "s1", agent: "query", expected: "one" }]);

    await run(false);

    const { timeoutMs, attemptMs } = loadAgentDefinition("query");
    expect(gateway.calls[0]).toMatchObject({ timeoutMs, attemptMs });
    expect(gateway.calls[0]).not.toHaveProperty("reasoning");
  });

  test("with reasoning, the budget doubles and what the model thought is kept on the step, call after call", async () => {
    const { store, gateway, run } = setup({ reasoning: "low" });
    await store.beginSteps("r1", [{ id: "s1", agent: "query", expected: "one" }]);
    gateway.reasonings.set("query", "Preciso das refeições de hoje.");

    expect((await run()).reasoning).toBe("Preciso das refeições de hoje.");
    gateway.reasonings.set("query", "x".repeat(13_000));
    await run();

    const { timeoutMs, attemptMs } = loadAgentDefinition("query");
    expect(gateway.calls[0]).toMatchObject({ reasoning: "low", timeoutMs: timeoutMs * 2, attemptMs: attemptMs * 2 });
    const thoughts = (await store.steps("r1"))[0]?.thoughts;
    expect(thoughts?.[0]).toEqual({ text: "Preciso das refeições de hoje.", at: NOW.toISOString(), model: "stub" });
    // O raciocinio guardado tem teto.
    expect(thoughts?.[1]?.text).toHaveLength(12_001);
  });

  test("with the model the user chose, the call goes to it in one attempt, at its effort, with a budget that grows with the effort", async () => {
    const { store, gateway, runner } = setup({ reasoning: "low" });
    await store.beginSteps("r1", [{ id: "s1", agent: "query", expected: "one" }]);
    gateway.reasonings.set("query", "Pensei no esforço escolhido.");
    const ask = (effort: "low" | "max") => runner.run({
      agent: "query", now: NOW, user: "pedido", schema, stepId: "s1",
      model: { provider: "anthropic", model: "claude-haiku-5-5", effort },
    });

    await ask("low");
    await ask("max");

    const { timeoutMs } = loadAgentDefinition("query");
    expect(gateway.calls[0]).toMatchObject({
      model: { provider: "anthropic", model: "claude-haiku-5-5", effort: "low" }, timeoutMs: timeoutMs * 3, attemptMs: timeoutMs * 3,
    });
    // O esforco e o da escolha: o do servidor nem vai, com ou sem `think`.
    expect(gateway.calls[0]).not.toHaveProperty("reasoning");
    expect(gateway.calls[1]).toMatchObject({ timeoutMs: timeoutMs * 9, attemptMs: timeoutMs * 9 });
    expect((await store.steps("r1"))[0]?.thoughts).toHaveLength(2);
  });

  test("the budget of a call on the chosen model has a ceiling, so a two-call step still ends before the client gives up", async () => {
    const { gateway, runner } = setup();
    gateway.outputs.set("agent_file_edit", { edits: [] });
    await runner.run({
      agent: "agent-file-edit", now: NOW, user: "pedido", schema: z.object({ edits: z.array(z.unknown()) }),
      model: { provider: "openai", model: "gpt-6.2-sol", effort: "max" },
    });
    expect(gateway.calls[0]).toMatchObject({ timeoutMs: 75_000, attemptMs: 75_000 });
  });

  test("the thought of an answer the schema refuses is kept too; a failing store does not fail the call", async () => {
    const { store, gateway, run } = setup({ reasoning: "low" });
    await store.beginSteps("r1", [{ id: "s1", agent: "query", expected: "one" }]);
    gateway.reasonings.set("query", "Não sei montar a consulta.");
    gateway.outputs.set("query", { nope: true });

    await expect(run()).rejects.toBeInstanceOf(FastStageError);
    expect((await store.steps("r1"))[0]?.thoughts).toHaveLength(1);

    gateway.outputs.set("query", { sql: "select 1" });
    store.recordThought = async () => { throw new Error("banco fora"); };
    await expect(run()).resolves.toMatchObject({ value: { sql: "select 1" } });
  });
});
