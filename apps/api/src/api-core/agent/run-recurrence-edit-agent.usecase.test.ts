import { describe, expect, test } from "vitest";
import type { CreateRecurrenceInput } from "@repo/contracts";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { CreateRecurrenceUseCase } from "../../features/create-recurrence/create-recurrence.usecase";
import { ListTimelineEventsUseCase } from "../../features/list-timeline-events/list-timeline-events.usecase";
import { createEventsKit } from "../events/testing/in-memory-events-kit";
import { InMemoryTimelineEventQuery } from "../events/testing/in-memory-timeline-event.query";
import { StubMealParsingGateway } from "../events/testing/stub-meal-parsing.gateway";
import { MaterializeRecurrencesUseCase } from "../recurrences/materialize-recurrences.usecase";
import { InMemoryRecurrenceRepository } from "../recurrences/testing/in-memory-recurrence.repository";
import { InMemoryTaskRepository } from "../tasks/testing/in-memory-task.repository";
import { RunAgentUseCase } from "./run-agent.usecase";
import { InMemoryEntityBatchWriter } from "./testing/in-memory-entity-batch-writer";
import { ScriptedAgentGateway } from "./testing/scripted-agent.gateway";
import { StubScopedSqlQuery } from "./testing/stub-scoped-sql-query";

// A serie nasce na segunda 07/09/2026; o agente age na quarta 16/09/2026, 12:00 em Sao Paulo.
const SEEDED_AT = new Date("2026-09-07T15:00:00Z");
const NOW = new Date("2026-09-16T15:00:00Z");
const owner: AuthenticatedUser = { userId: "user-1" };
const stranger: AuthenticatedUser = { userId: "user-2" };

const weeklyRun: CreateRecurrenceInput = {
  target: "event",
  frequency: "weekly",
  interval: 1,
  byWeekday: 0b000_1010,
  timeOfDay: "07:00",
  durationMinutes: 60,
  timeZone: "America/Sao_Paulo",
  startsOn: "2026-09-07",
  template: { name: "Corrida", kind: "routine" },
};

async function setup(seed: CreateRecurrenceInput = weeklyRun) {
  const clock = { now: SEEDED_AT };
  const { database, eventRepository: events, noteRepository: notes, createEvent } = createEventsKit({
    mealParsingGateway: new StubMealParsingGateway({ items: [], modelProvider: "stub", modelName: "stub" }),
    clock: () => clock.now,
  });
  const tasks = new InMemoryTaskRepository();
  const recurrences = new InMemoryRecurrenceRepository(database);
  const materializer = new MaterializeRecurrencesUseCase(recurrences, () => clock.now);
  const { recurrenceId } = await new CreateRecurrenceUseCase(recurrences, createEvent, tasks).execute(seed, owner);
  await materializer.materialize(owner.userId);
  clock.now = NOW;

  const writer = new InMemoryEntityBatchWriter({ events, tasks, notes, recurrences });
  const dayRead = { name: "get_day_context", args: { date: "2026-09-16" } };
  const run = (...commands: Array<{ skill: string; args: Record<string, unknown> }>) =>
    new RunAgentUseCase(
      new ScriptedAgentGateway(
        [{ name: "query_data", args: { sql: "SELECT id FROM recurrences" } }, dayRead],
        JSON.stringify({ commands }),
      ),
      new StubScopedSqlQuery(), writer, { events, tasks, notes, recurrences }, createEvent,
      undefined, undefined, () => NOW, { route: async () => ({ kind: "complex" }) },
      { get: async () => ({ date: "2026-09-16", timeZone: "America/Sao_Paulo", events: [], tasks: [], notes: [] }) },
    );
  const days = () =>
    database.events
      .filter((event) => event.occurrence?.recurrenceId === recurrenceId)
      .map((event) => `${event.occurrence?.occurrenceOn} ${event.startedAt.toISOString().slice(11, 16)}`)
      .sort();
  return { database, recurrences, tasks, writer, materializer, recurrenceId, run, days, clock };
}

describe("agent alters recurring events", () => {
  test("changes the time from today on and keeps the past as it happened", async () => {
    const ctx = await setup();
    expect(ctx.days().slice(0, 3)).toEqual(["2026-09-07 10:00", "2026-09-09 10:00", "2026-09-14 10:00"]);

    const response = await ctx.run({ skill: "save_recurrence", args: { id: ctx.recurrenceId, timeOfDay: "08:00" } })
      .execute({ userId: "user-1", text: "Mude a corrida para as 8h" }, owner);

    const [change] = ctx.writer.commits[0]?.recurrenceChanges ?? [];
    expect(change).toMatchObject({ op: "update", expectedRevision: 1, fromDay: "2026-09-16" });
    // O que ja aconteceu fica; de hoje em diante so a ocorrencia nova do lote existe ate a proxima leitura.
    expect(ctx.days()).toEqual(["2026-09-07 10:00", "2026-09-09 10:00", "2026-09-14 10:00", "2026-09-16 11:00"]);
    expect(response.createdEntities).toHaveLength(1);
    expect(response.createdEntities[0]).toMatchObject({ kind: "event", name: "Corrida" });
    expect(response.agentResponse).toBe(
      "Atualizei a recorrência Corrida: toda segunda e quarta às 08:00 por 1 h, a partir de 07/09/2026.",
    );
    expect(ctx.recurrences.recurrences[0]).toMatchObject({
      revision: 2, rule: { byWeekday: 0b000_1010, timeOfDay: "08:00", durationMinutes: 60 },
    });
  });

  test("the next list read regenerates the rest with the new rule, with no duplicate day", async () => {
    const ctx = await setup();
    await ctx.run({ skill: "save_recurrence", args: { id: ctx.recurrenceId, timeOfDay: "08:00" } })
      .execute({ userId: "user-1", text: "Mude a corrida para as 8h" }, owner);

    const list = new ListTimelineEventsUseCase(new InMemoryTimelineEventQuery(ctx.database), ctx.materializer);
    const page = await list.execute({ from: "2026-09-16T00:00:00-03:00", to: "2026-09-24T00:00:00-03:00", limit: 50 }, owner);

    expect(page.items.map((item) => item.startedAt.slice(0, 16)).sort()).toEqual([
      "2026-09-16T11:00", "2026-09-21T11:00", "2026-09-23T11:00",
    ]);
  });

  test("changing the weekdays alone keeps the time and the duration", async () => {
    const ctx = await setup();

    await ctx.run({ skill: "save_recurrence", args: { id: ctx.recurrenceId, weekdays: ["tue", "thu"] } })
      .execute({ userId: "user-1", text: "Só terça e quinta" }, owner);

    expect(ctx.recurrences.recurrences[0]?.rule).toMatchObject({
      frequency: "weekly", byWeekday: 0b001_0100, timeOfDay: "07:00", durationMinutes: 60,
    });
    expect(ctx.days().at(-1)).toBe("2026-09-17 10:00");
  });

  test("a new frequency drops the old weekdays and takes what startsOn implies", async () => {
    const ctx = await setup();

    await ctx.run({ skill: "save_recurrence", args: { id: ctx.recurrenceId, frequency: "monthly", startsOn: "2026-09-20" } })
      .execute({ userId: "user-1", text: "Agora é todo mês" }, owner);

    const rule = ctx.recurrences.recurrences[0]?.rule;
    expect(rule).toMatchObject({ frequency: "monthly", byMonthDay: 20, timeOfDay: "07:00" });
    expect(rule).not.toHaveProperty("byWeekday");
  });

  test("renaming keeps the series notes and applies to the occurrences from today", async () => {
    const ctx = await setup();

    const response = await ctx.run({ skill: "save_recurrence", args: { id: ctx.recurrenceId, name: "Corrida leve" } })
      .execute({ userId: "user-1", text: "Chame de corrida leve" }, owner);

    expect(ctx.recurrences.recurrences[0]?.template).toMatchObject({ name: "Corrida leve", kind: "routine" });
    expect(response.createdEntities[0]).toMatchObject({ name: "Corrida leve" });
    expect(response.agentResponse).toContain("Atualizei a recorrência Corrida leve");
  });

  test("an end date that already passed shows what left and keeps the series", async () => {
    const ctx = await setup();

    const response = await ctx.run({ skill: "save_recurrence", args: { id: ctx.recurrenceId, endsOn: "2026-09-15" } })
      .execute({ userId: "user-1", text: "Pare a corrida ontem" }, owner);

    expect(ctx.days()).toEqual(["2026-09-07 10:00", "2026-09-09 10:00", "2026-09-14 10:00"]);
    expect(response.createdEntities).toEqual([]);
    expect(response.deletedEntities).toHaveLength(1);
    expect(ctx.recurrences.recurrences[0]?.rule.endsOn).toBe("2026-09-15");
  });

  test.each([
    ["another user's series", { id: "FROM_OTHER" }, "Não encontrei a recorrência"],
    ["a series that does not exist", { id: "01K0000000000000000000000X" }, "Não encontrei a recorrência"],
    ["a different target", { target: "task" }, "isso não muda"],
    ["a different kind", { kind: "meal" }, "não muda"],
    ["weekdays on a monthly change", { frequency: "monthly", weekdays: ["mon"] }, "weekdays só vale"],
  ])("refuses %s and commits nothing", async (_name, extra, message) => {
    const ctx = await setup();
    const id = (extra as { id?: string }).id === "FROM_OTHER" ? ctx.recurrenceId : ((extra as { id?: string }).id ?? ctx.recurrenceId);
    const actor = (extra as { id?: string }).id === "FROM_OTHER" ? stranger : owner;
    const args = { ...extra, id };

    await expect(ctx.run({ skill: "save_recurrence", args }).execute({ userId: actor.userId, text: "Mude" }, actor))
      .rejects.toThrow(message);

    expect(ctx.writer.commits).toEqual([]);
    expect(ctx.recurrences.recurrences[0]?.revision).toBe(1);
  });

  test("an occurrence changed in the same turn cannot be combined with its series", async () => {
    const ctx = await setup();
    const today = ctx.database.events.find((event) => event.occurrence?.occurrenceOn === "2026-09-16");

    await expect(
      ctx.run(
        { skill: "save_routine_event", args: { id: today?.id, name: "Corrida longa" } },
        { skill: "save_recurrence", args: { id: ctx.recurrenceId, timeOfDay: "08:00" } },
      ).execute({ userId: "user-1", text: "Mude tudo" }, owner),
    ).rejects.toThrow("faça a série em outro pedido");

    expect(ctx.writer.commits).toEqual([]);
  });
});

describe("agent deletes recurring events", () => {
  test("removes the series and the upcoming occurrences, and keeps the past without the link", async () => {
    const ctx = await setup();

    const response = await ctx.run({ skill: "delete_entity", args: { kind: "recurrence", id: ctx.recurrenceId } })
      .execute({ userId: "user-1", text: "Apague a recorrência da corrida" }, owner);

    expect(ctx.writer.commits[0]?.recurrenceChanges).toEqual([
      { op: "delete", id: ctx.recurrenceId, fromDay: "2026-09-16" },
    ]);
    expect(ctx.recurrences.recurrences).toEqual([]);
    const remaining = ctx.database.events.map((event) => event.startedAt.toISOString().slice(0, 10)).sort();
    expect(remaining).toEqual(["2026-09-07", "2026-09-09", "2026-09-14"]);
    // Uma ocorrencia que sai representa a serie na resposta: o app atualiza a lista.
    expect(response.deletedEntities).toHaveLength(1);
    expect(response.deletedEntities[0]).toMatchObject({ kind: "event", name: "Corrida" });
    expect(response.agentResponse).toBe(
      "Apaguei a recorrência Corrida. As ocorrências de hoje em diante saíram; as anteriores ficam na agenda.",
    );
  });

  test("a series that is not the user's is not found", async () => {
    const ctx = await setup();

    await expect(
      ctx.run({ skill: "delete_entity", args: { kind: "recurrence", id: ctx.recurrenceId } })
        .execute({ userId: "user-2", text: "Apague" }, stranger),
    ).rejects.toThrow("Não encontrei a recorrência");

    expect(ctx.recurrences.recurrences).toHaveLength(1);
  });

  test("a task series is removed the same way", async () => {
    // O que a resposta mostra no lugar da serie e coberto no Postgres: o fake guarda as tarefas da serie a parte.
    const ctx = await setup({
      target: "task", frequency: "daily", interval: 1, timeOfDay: "09:00", timeZone: "America/Sao_Paulo",
      startsOn: "2026-09-07", template: { name: "Beber água" },
    });

    const response = await ctx.run({ skill: "delete_entity", args: { kind: "recurrence", id: ctx.recurrenceId } })
      .execute({ userId: "user-1", text: "Apague a tarefa recorrente" }, owner);

    expect(ctx.recurrences.recurrences).toEqual([]);
    expect(ctx.recurrences.tasks.filter((task) => (task.occurrence?.occurrenceOn ?? "") >= "2026-09-16")).toEqual([]);
    expect(response.agentResponse).toContain("Apaguei a recorrência Beber água.");
  });
});
