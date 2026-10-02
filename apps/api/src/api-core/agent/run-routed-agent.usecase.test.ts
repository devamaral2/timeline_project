import { expect, test } from "vitest";
import type { CreateEventInput } from "@repo/contracts";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { CreateEventUseCase } from "../events/create-event.usecase";
import { InMemoryEventDatabase } from "../events/testing/in-memory-event-database";
import { InMemoryEventRepository } from "../events/testing/in-memory-event.repository";
import { InMemoryWorkoutCatalog } from "../events/testing/in-memory-workout.catalog";
import { StubMealParsingGateway } from "../events/testing/stub-meal-parsing.gateway";
import { InMemoryNoteRepository } from "../notes/testing/in-memory-note.repository";
import { InMemoryTaskRepository } from "../tasks/testing/in-memory-task.repository";
import type { DayContext, DayContextQuery } from "./day-context.query";
import { RunAgentUseCase } from "./run-agent.usecase";
import type { AgentRoute } from "./routing/agent-router";
import { InMemoryEntityBatchWriter } from "./testing/in-memory-entity-batch-writer";
import { ScriptedAgentGateway, type ScriptedToolCall } from "./testing/scripted-agent.gateway";
import { StubScopedSqlQuery } from "./testing/stub-scoped-sql-query";

const NOW = new Date("2026-09-16T15:00:00Z");
const owner: AuthenticatedUser = { userId: "user-1" };
const local = (hour: number) => `2026-09-16T${String(hour).padStart(2, "0")}:00:00-03:00`;

function setup(route: AgentRoute, calls: ScriptedToolCall[], answer: object, day?: DayContext) {
  const events = new InMemoryEventRepository(new InMemoryEventDatabase());
  const tasks = new InMemoryTaskRepository();
  const notes = new InMemoryNoteRepository();
  const createEvent = new CreateEventUseCase(
    events, new StubMealParsingGateway({ items: [], modelProvider: "stub", modelName: "stub" }),
    new InMemoryWorkoutCatalog(), undefined, () => NOW,
  );
  const agent = new ScriptedAgentGateway(calls, JSON.stringify(answer));
  const writer = new InMemoryEntityBatchWriter({ events, tasks, notes });
  const dayContext: DayContextQuery = { get: async () => day ?? { date: "2026-09-16", timeZone: "America/Sao_Paulo", events: [], tasks: [], notes: [] } };
  const useCase = new RunAgentUseCase(
    agent, new StubScopedSqlQuery(), writer, { events, tasks, notes }, createEvent,
    undefined, undefined, () => NOW, { route: async () => route }, dayContext,
  );
  return { useCase, agent, writer, events, tasks, createEvent };
}

test("single task route exposes only read tools, validates JSON and creates the public reply", async () => {
  const ctx = setup({ kind: "single", skill: "save_task" },
    [{ name: "query_data", args: { sql: "SELECT count(*) FROM tasks" } }],
    { commands: [{ skill: "save_task", args: { name: "Limpar a casa" } }] });
  const response = await ctx.useCase.execute({ userId: "user-1", text: "Crie a tarefa limpar a casa" }, owner);
  expect(ctx.agent.lastInput?.tools.map((tool) => tool.name)).toEqual(["query_data", "get_day_context"]);
  expect(response.createdEntities[0]).toMatchObject({ kind: "task", name: "Limpar a casa" });
  expect(response.agentResponse).toContain("Limpar a casa");
  expect(ctx.writer.commits).toHaveLength(1);
});

test("a write without prior consultation commits nothing", async () => {
  const ctx = setup({ kind: "single", skill: "save_task" }, [],
    { commands: [{ skill: "save_task", args: { name: "Limpar" } }] });
  await expect(ctx.useCase.execute({ userId: "user-1", text: "Crie uma tarefa" }, owner)).rejects.toThrow("Consulte os dados");
  expect(ctx.writer.commits).toEqual([]);
});

test("updating work after the daily read shifts leisure and leaves a later event unchanged", async () => {
  const base = setup({ kind: "single", skill: "save_routine_event" }, [], { commands: [] });
  const seed = async (name: string, from: number, to: number) => {
    const input: CreateEventInput = { name, startedAt: local(from), finishedAt: local(to), items: [{ type: "routine", data: {} }] };
    return (await base.createEvent.execute(input, { userId: "user-1" })).eventId;
  };
  const workId = await seed("Trabalho", 13, 16);
  const leisureId = await seed("Lazer", 16, 17);
  const readingId = await seed("Ler", 20, 21);
  const day: DayContext = {
    date: "2026-09-16", timeZone: "America/Sao_Paulo", tasks: [], notes: [],
    events: [
      { id: workId, name: "Trabalho", started_at: local(13), finished_at: local(16), recurrence_id: null, taskIds: [], items: [{ type: "routine", is_primary: true }] },
      { id: leisureId, name: "Lazer", started_at: local(16), finished_at: local(17), recurrence_id: null, taskIds: [], items: [{ type: "routine", is_primary: true }] },
      { id: readingId, name: "Ler", started_at: local(20), finished_at: local(21), recurrence_id: null, taskIds: [], items: [{ type: "routine", is_primary: true }] },
    ],
  };
  const routed = new RunAgentUseCase(
    new ScriptedAgentGateway(
      [{ name: "get_day_context", args: { date: "2026-09-16" } }],
      JSON.stringify({ commands: [{ skill: "save_routine_event", args: { id: workId, finishedAt: local(17) } }] }),
    ),
    new StubScopedSqlQuery(), base.writer, { events: base.events, tasks: base.tasks, notes: new InMemoryNoteRepository() },
    base.createEvent, undefined, undefined, () => NOW,
    { route: async () => ({ kind: "single", skill: "save_routine_event" }) },
    { get: async () => day },
  );
  const response = await routed.execute({ userId: "user-1", text: "Acabei de trabalhar agora" }, owner);
  expect(response.updatedEntities.map((item) => item.id).sort()).toEqual([workId, leisureId].sort());
  expect((await base.events.findById(leisureId))?.startedAt).toEqual(new Date(local(17)));
  expect((await base.events.findById(leisureId))?.finishedAt).toEqual(new Date(local(18)));
  expect((await base.events.findById(readingId))?.startedAt).toEqual(new Date(local(20)));
});

test("a complex request rearranges events created earlier in the same atomic batch", async () => {
  const answer = { commands: [
    { skill: "save_routine_event", args: { name: "Estudo", startedAt: local(13), finishedAt: local(14) } },
    { skill: "save_routine_event", args: { name: "Trabalho", startedAt: local(12), finishedAt: local(15) } },
  ] };
  const ctx = setup({ kind: "complex" }, [{ name: "get_day_context", args: { date: "2026-09-16" } }], answer);
  const response = await ctx.useCase.execute({ userId: "user-1", text: "Trabalhei e estudei" }, owner);
  expect(ctx.writer.commits).toHaveLength(1);
  expect(response.createdEntities).toHaveLength(2);
  const study = response.createdEntities.find((item) => item.name === "Estudo");
  expect(study).toMatchObject({ startedAt: new Date(local(15)).toISOString(), finishedAt: new Date(local(16)).toISOString() });
});

test("a long day requires every context page before an event can be written", async () => {
  const day: DayContext = {
    date: "2026-09-16", timeZone: "America/Sao_Paulo", tasks: [], notes: [],
    events: Array.from({ length: 30 }, (_, index) => ({
      id: `event-${index}`, name: `Evento ${index}`, started_at: local(20), finished_at: local(21),
      recurrence_id: null, taskIds: [], description: "x".repeat(1000),
      items: [{ type: "routine", is_primary: true }],
    })),
  };
  const answer = { commands: [{ skill: "save_routine_event", args: {
    name: "Trabalho", startedAt: local(8), finishedAt: local(9),
  } }] };
  const partial = setup({ kind: "single", skill: "save_routine_event" },
    [{ name: "get_day_context", args: { date: day.date } }], answer, day);
  await expect(partial.useCase.execute({ userId: "user-1", text: "Trabalhei" }, owner))
    .rejects.toThrow("Consulte todos os eventos");
  expect(partial.agent.results[0]).toMatchObject({ ok: true, page: 1, hasMore: true, nextPage: 2 });
  expect(partial.writer.commits).toHaveLength(0);

  const complete = setup({ kind: "single", skill: "save_routine_event" }, [
    { name: "get_day_context", args: { date: day.date } },
    { name: "get_day_context", args: { date: day.date, page: 2 } },
  ], answer, day);
  const response = await complete.useCase.execute({ userId: "user-1", text: "Trabalhei" }, owner);
  expect(complete.agent.results[1]).toMatchObject({ ok: true, page: 2, hasMore: false });
  expect(response.createdEntities).toHaveLength(1);
});

test("simultaneous affected events ask for order and discard the entire batch", async () => {
  const base = setup({ kind: "complex" }, [], { commands: [] });
  const seed = async (name: string, from: number, to: number) => base.createEvent.execute({
    name, startedAt: local(from), finishedAt: local(to), items: [{ type: "routine", data: {} }],
  }, { userId: owner.userId });
  const workId = (await seed("Trabalho", 13, 16)).eventId;
  const leisureId = (await seed("Lazer", 16, 17)).eventId;
  const readingId = (await seed("Leitura", 16, 17)).eventId;
  const day: DayContext = {
    date: "2026-09-16", timeZone: "America/Sao_Paulo", tasks: [], notes: [],
    events: [
      { id: workId, name: "Trabalho", started_at: local(13), finished_at: local(16), recurrence_id: null, taskIds: [], items: [{ type: "routine", is_primary: true }] },
      { id: leisureId, name: "Lazer", started_at: local(16), finished_at: local(17), recurrence_id: null, taskIds: [], items: [{ type: "routine", is_primary: true }] },
      { id: readingId, name: "Leitura", started_at: local(16), finished_at: local(17), recurrence_id: null, taskIds: [], items: [{ type: "routine", is_primary: true }] },
    ],
  };
  // A consulta diária e o repositório precisam representar os mesmos registros.
  const agent = new ScriptedAgentGateway(
    [{ name: "get_day_context", args: { date: day.date } }],
    JSON.stringify({ commands: [{ skill: "save_routine_event", args: { id: workId, finishedAt: local(17) } }] }),
  );
  const useCase = new RunAgentUseCase(agent, new StubScopedSqlQuery(), base.writer,
    { events: base.events, tasks: base.tasks, notes: new InMemoryNoteRepository() }, base.createEvent,
    undefined, undefined, () => NOW, { route: async () => ({ kind: "single", skill: "save_routine_event" }) },
    { get: async () => day });
  const response = await useCase.execute({ userId: owner.userId, text: "Acabei o trabalho às 17h" }, owner);
  expect(response.agentResponse).toContain("Qual deve vir primeiro?");
  expect(response.updatedEntities).toEqual([]);
  expect(base.writer.commits).toHaveLength(0);
  expect((await base.events.findById(workId))?.finishedAt).toEqual(new Date(local(16)));
});
