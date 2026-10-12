import { describe, expect, test } from "vitest";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
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

// Quarta-feira, 16/09/2026, 12:00 em Sao Paulo.
const NOW = new Date("2026-09-16T15:00:00Z");
const owner: AuthenticatedUser = { userId: "user-1" };

function setup(command: { skill: string; args: Record<string, unknown> }) {
  const { database, eventRepository: events, noteRepository: notes, createEvent } = createEventsKit({
    mealParsingGateway: new StubMealParsingGateway({ items: [], modelProvider: "stub", modelName: "stub" }),
    clock: () => NOW,
  });
  const tasks = new InMemoryTaskRepository();
  const recurrences = new InMemoryRecurrenceRepository(database);
  const writer = new InMemoryEntityBatchWriter({ events, tasks, notes, recurrences });
  const agent = new ScriptedAgentGateway(
    [{ name: "query_data", args: { sql: "SELECT id FROM recurrences" } }],
    JSON.stringify({ commands: [command] }),
  );
  const useCase = new RunAgentUseCase(
    agent, new StubScopedSqlQuery(), writer, { events, tasks, notes }, createEvent,
    undefined, undefined, () => NOW, { route: async () => ({ kind: "complex" }) },
    { get: async () => ({ date: "2026-09-16", timeZone: "America/Sao_Paulo", events: [], tasks: [], notes: [] }) },
  );
  const materializer = new MaterializeRecurrencesUseCase(recurrences, () => NOW);
  return { useCase, agent, writer, database, tasks, recurrences, materializer };
}

describe("agent creates recurring events", () => {
  const weeklyRun = {
    skill: "save_recurrence",
    args: {
      target: "event",
      name: "Corrida",
      frequency: "weekly",
      weekdays: ["mon", "wed"],
      timeOfDay: "07:00",
      durationMinutes: 60,
    },
  };

  test("saves the series and its first occurrence in one batch and describes the rule", async () => {
    const ctx = setup(weeklyRun);

    const response = await ctx.useCase.execute({ userId: "user-1", text: "Corrida toda segunda e quarta às 7h" }, owner);

    expect(ctx.agent.lastInput?.tools.map((tool) => tool.name)).toContain("get_day_context");
    expect(ctx.writer.commits).toHaveLength(1);
    const [series] = ctx.writer.commits[0]?.recurrences ?? [];
    expect(series).toMatchObject({
      target: "event",
      rule: { frequency: "weekly", byWeekday: 0b000_1010, timeOfDay: "07:00", durationMinutes: 60, startsOn: "2026-09-16" },
    });
    expect(response.createdEntities).toHaveLength(1);
    expect(response.createdEntities[0]).toMatchObject({ kind: "event", name: "Corrida" });
    // O texto fala da serie, nao so da ocorrencia que entrou no lote.
    expect(response.agentResponse).toBe(
      "Criei a recorrência Corrida: toda segunda e quarta às 07:00 por 1 h, a partir de 16/09/2026.",
    );
  });

  test("the series shows up in the timeline, with no duplicate of the first occurrence", async () => {
    const ctx = setup(weeklyRun);
    await ctx.useCase.execute({ userId: "user-1", text: "Corrida toda segunda e quarta às 7h" }, owner);

    // O mesmo caminho que a tela usa: a leitura da lista materializa a serie.
    const list = new ListTimelineEventsUseCase(new InMemoryTimelineEventQuery(ctx.database), ctx.materializer);
    const page = await list.execute({ from: "2026-09-14T00:00:00-03:00", to: "2026-10-06T00:00:00-03:00", limit: 50 }, owner);

    const days = page.items.map((item) => item.startedAt.slice(0, 10)).sort();
    expect(days).toEqual(["2026-09-16", "2026-09-21", "2026-09-23", "2026-09-28", "2026-09-30", "2026-10-05"]);
    expect(page.items.every((item) => item.name === "Corrida")).toBe(true);
    expect(ctx.database.events.filter((event) => event.occurrence?.occurrenceOn === "2026-09-16")).toHaveLength(1);
  });

  test("fills what startsOn implies when the user did not say it", async () => {
    const ctx = setup({
      skill: "save_recurrence",
      args: { target: "event", name: "Revisar finanças", frequency: "monthly", timeOfDay: "20:00", startsOn: "2026-09-25" },
    });

    const response = await ctx.useCase.execute({ userId: "user-1", text: "Todo mês revisar as finanças" }, owner);

    const [series] = ctx.writer.commits[0]?.recurrences ?? [];
    expect(series?.rule).toMatchObject({ frequency: "monthly", byMonthDay: 25 });
    expect(response.agentResponse).toContain("todo dia 25 do mês às 20:00");
  });

  test("refuses weekdays on a daily rule and commits nothing", async () => {
    const ctx = setup({
      skill: "save_recurrence",
      args: { target: "event", name: "Correr", frequency: "daily", weekdays: ["mon"], timeOfDay: "07:00" },
    });

    await expect(ctx.useCase.execute({ userId: "user-1", text: "Correr" }, owner)).rejects.toThrow("weekdays só vale");

    expect(ctx.writer.commits).toEqual([]);
    expect(ctx.recurrences.recurrences).toEqual([]);
  });
});

describe("agent creates recurring tasks", () => {
  const command = {
    skill: "save_recurrence",
    args: {
      target: "task",
      name: "Pagar o aluguel",
      frequency: "monthly",
      monthDay: 5,
      timeOfDay: "09:00",
      priority: "high",
      startsOn: "2026-09-01",
    },
  };

  test("creates the series with its first task and the rest appear on the next list read", async () => {
    const ctx = setup(command);

    const response = await ctx.useCase.execute({ userId: "user-1", text: "Todo dia 5 pagar o aluguel" }, owner);

    expect(response.createdEntities).toHaveLength(1);
    expect(response.createdEntities[0]).toMatchObject({ kind: "task", name: "Pagar o aluguel" });
    expect(response.agentResponse).toBe("Criei a recorrência Pagar o aluguel: todo dia 5 do mês às 09:00, a partir de 01/09/2026.");
    // Hoje e 16/09: a primeira ocorrencia e a de outubro.
    const [first] = ctx.tasks.all();
    expect(first?.occurrence?.occurrenceOn).toBe("2026-10-05");
    expect(first?.priority).toBe("high");

    // O fake de recorrencias guarda as tarefas geradas numa lista propria, separada do
    // repositorio de tarefas; a unicidade de um dia por serie e do indice do Postgres e
    // fica coberta no teste de integracao do lote.
    await ctx.materializer.materialize("user-1");
    expect(ctx.recurrences.tasks.map((task) => task.occurrence?.occurrenceOn)).toContain("2026-11-05");
  });

  test("a task recurrence needs a name", async () => {
    const ctx = setup({ skill: "save_recurrence", args: { target: "task", frequency: "daily", timeOfDay: "09:00" } });

    await expect(ctx.useCase.execute({ userId: "user-1", text: "Tarefa diária" }, owner)).rejects.toThrow("name é obrigatório");
  });
});
