import { expect, test, vi } from "vitest";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { createEventsKit } from "../events/testing/in-memory-events-kit";
import { StubMealParsingGateway } from "../events/testing/stub-meal-parsing.gateway";
import { InMemoryTaskRepository } from "../tasks/testing/in-memory-task.repository";
import type { DayContextQuery } from "./day-context.query";
import { RunAgentUseCase } from "./run-agent.usecase";
import type { AgentRoute, RouteDecision } from "./routing/agent-router";
import type { TurnTraceRecord, TurnTraceSink } from "./services/turn-trace";
import { InMemoryEntityBatchWriter } from "./testing/in-memory-entity-batch-writer";
import { ScriptedAgentGateway, type ScriptedToolCall } from "./testing/scripted-agent.gateway";
import { StubScopedSqlQuery } from "./testing/stub-scoped-sql-query";

const NOW = new Date("2026-09-16T15:00:00Z");
const owner: AuthenticatedUser = { userId: "user-1" };
const decision: RouteDecision = {
  source: "jev", latencyMs: 250, model: "jev-1.13.0", fallbackReason: "count_many",
  goal: { choice: "write", confidence: 0.99, probability: 0.99 },
  count: { choice: "many", confidence: 0.97, probability: 0.97 },
};

function setup(route: AgentRoute, calls: ScriptedToolCall[], answer: object, sink: TurnTraceSink) {
  const { eventRepository: events, noteRepository: notes, createEvent } = createEventsKit({
    mealParsingGateway: new StubMealParsingGateway({ items: [], modelProvider: "stub", modelName: "stub" }),
    clock: () => NOW,
  });
  const tasks = new InMemoryTaskRepository();
  const writer = new InMemoryEntityBatchWriter({ events, tasks, notes });
  const dayContext: DayContextQuery = {
    get: async () => ({ date: "2026-09-16", timeZone: "America/Sao_Paulo", events: [], tasks: [], notes: [] }),
  };
  return new RunAgentUseCase(
    new ScriptedAgentGateway(calls, JSON.stringify(answer)), new StubScopedSqlQuery(), writer,
    { events, tasks, notes }, createEvent, undefined, undefined, () => NOW,
    { route: async (input) => { input.onDecision?.(decision); return route; } },
    dayContext, undefined, sink,
  );
}

function collector() {
  const records: TurnTraceRecord[] = [];
  return { records, sink: { record: async (trace: TurnTraceRecord) => { records.push(trace); } } };
}

test("a successful turn records route, JEV decision, tool calls and stage times", async () => {
  const { records, sink } = collector();
  const useCase = setup({ kind: "single", skill: "save_task" },
    [{ name: "query_data", args: { sql: "SELECT count(*) FROM tasks" } }],
    { commands: [{ skill: "save_task", args: { name: "Limpar a casa" } }] }, sink);

  await useCase.execute({ userId: "user-1", text: "Crie a tarefa limpar a casa" }, owner);

  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({
    userId: "user-1", actorId: "user-1", mode: "rest", route: "save_task", rerouted: false,
    outcome: "ok", errorCode: null, changes: 1, routeDecision: decision,
    tools: [{ name: "query_data", ok: true }],
  });
  expect(Object.keys(records[0].stages)).toEqual(expect.arrayContaining(["routeMs", "agentMs", "readsMs", "commandsMs", "commitMs"]));
  expect(JSON.stringify(records[0])).not.toContain("Limpar a casa");
});

test("a failed turn still leaves a trace with the outcome and error code", async () => {
  const { records, sink } = collector();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const useCase = setup({ kind: "single", skill: "save_task" }, [],
    { commands: [{ skill: "save_task", args: { name: "Limpar" } }] }, sink);

  await expect(useCase.execute({ userId: "user-1", text: "Crie uma tarefa" }, owner)).rejects.toThrow("Consulte os dados");

  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({ outcome: "invalid_input", errorCode: "InvalidInputError", changes: 0 });
});

test("a trace sink failure never changes the user's turn", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const useCase = setup({ kind: "single", skill: "save_task" },
    [{ name: "query_data", args: { sql: "SELECT count(*) FROM tasks" } }],
    { commands: [{ skill: "save_task", args: { name: "Limpar a casa" } }] },
    { record: async () => { throw new Error("db down"); } });

  const response = await useCase.execute({ userId: "user-1", text: "Crie a tarefa limpar a casa" }, owner);

  expect(response.createdEntities).toHaveLength(1);
});
