import { describe, expect, test } from "vitest";
import { Task } from "../../domain/index";
import type { TrackedQueryParams } from "../../domain/ports";
import { InMemoryTaskCardQuery } from "../../api-core/tasks/testing/in-memory-task-card.query";
import { InMemoryTaskDatabase } from "../../api-core/tasks/testing/in-memory-task-database";
import { ListTrackedTasksUseCase, type ListTrackedTasksFilter } from "./list-tracked-tasks.usecase";

const actor = { userId: "auth-user-1" };
const at = (iso: string) => new Date(iso);

function task(id: string, overrides: Partial<Parameters<typeof Task.create>[0]> = {}): Task {
  return Task.create({ id, userId: actor.userId, name: id, status: "todo", ...overrides });
}

async function list(tasks: Task[], filter?: ListTrackedTasksFilter): Promise<string[]> {
  const useCase = new ListTrackedTasksUseCase(new InMemoryTaskCardQuery(new InMemoryTaskDatabase(tasks)));
  return (await useCase.execute(filter, actor)).map((card) => card.id);
}

describe("what the tracked list shows", () => {
  test("tasks with a status, of people and agents, long-running ones included", async () => {
    const ids = await list([
      task("review"),
      task("project", { longRunning: true }),
      task("request", { actor: "agent", kind: "request", status: "running" }),
      Task.create({ id: "reference", userId: actor.userId, name: "Reunião", startedAt: at("2026-08-17T15:00:00.000Z") }),
      task("step", { actor: "agent", kind: "step", status: "completed" }),
      Task.create({ id: "theirs", userId: "someone-else", name: "Deles", status: "todo" }),
    ]);

    expect(ids).toEqual(["project", "request", "review"]);
  });

  test("orders by the start or, without one, by the deadline; tasks without dates come last", async () => {
    const ids = await list([
      task("undated-b"),
      task("deadline", { estimatedFinishAt: at("2026-08-18T12:00:00.000Z") }),
      task("starts-late", { startedAt: at("2026-08-19T12:00:00.000Z") }),
      task("starts-early", { startedAt: at("2026-08-17T12:00:00.000Z"), estimatedFinishAt: at("2026-08-30T12:00:00.000Z") }),
      task("undated-a"),
    ]);

    expect(ids).toEqual(["starts-early", "deadline", "starts-late", "undated-a", "undated-b"]);
  });

  test("returns cards with the status, the dates as stored and the main task", async () => {
    const database = new InMemoryTaskDatabase([
      task("project", { longRunning: true }),
      task("review", { status: "inHold", priority: "urgent", estimatedFinishAt: at("2026-08-18T12:00:00.000Z"), tags: ["casa"] }),
    ]);
    database.edges.push({ parentId: "project", subtaskId: "review" });
    const useCase = new ListTrackedTasksUseCase(new InMemoryTaskCardQuery(database));

    const cards = await useCase.execute(undefined, actor);

    expect(cards.find((card) => card.id === "review")).toMatchObject({
      status: "inHold",
      priority: "urgent",
      estimatedFinishAt: "2026-08-18T12:00:00.000Z",
      tags: ["casa"],
      parentTaskId: "project",
      longRunning: false,
      revision: 1,
    });
    expect(cards.find((card) => card.id === "review")).not.toHaveProperty("missed");
    expect(cards.find((card) => card.id === "project")).not.toHaveProperty("parentTaskId");
    expect(cards.find((card) => card.id === "project")).not.toHaveProperty("subtaskIds");
  });
});

describe("filters", () => {
  const tasks = [
    task("pay-rent", { name: "Pagar Aluguel", priority: "urgent", tags: ["casa"], startedAt: at("2026-08-17T12:00:00.000Z") }),
    task("report", { name: "Relatório 100%", status: "doing", priority: "high", estimatedFinishAt: at("2026-08-20T12:00:00.000Z") }),
    task("missed", { name: "Dentista", status: "missed", priority: "low", startedAt: at("2026-08-10T12:00:00.000Z") }),
    task("project", { name: "Reforma", longRunning: true, tags: ["casa"] }),
    task("request", { name: "Pesquisar voos", actor: "agent", kind: "search_request", status: "failed" }),
  ];

  test("by executor", async () => {
    expect(await list(tasks, { actor: "agent" })).toEqual(["request"]);
    expect(await list(tasks, { actor: "human" })).toEqual(["missed", "pay-rent", "report", "project"]);
  });

  test("by status, of people or of agents; `missed` is a status like any other", async () => {
    expect(await list(tasks, { status: ["missed"] })).toEqual(["missed"]);
    expect(await list(tasks, { status: ["doing", "failed"] })).toEqual(["report", "request"]);
    expect(await list(tasks, { status: [] })).toHaveLength(5);
  });

  test("by priority", async () => {
    expect(await list(tasks, { priority: ["urgent", "high"] })).toEqual(["pay-rent", "report"]);
  });

  test("by tag", async () => {
    expect(await list(tasks, { tag: "casa" })).toEqual(["pay-rent", "project"]);
  });

  test("by a search in the name, case-insensitive and literal", async () => {
    expect(await list(tasks, { q: "aluguel" })).toEqual(["pay-rent"]);
    expect(await list(tasks, { q: "100%" })).toEqual(["report"]);
    expect(await list(tasks, { q: "_" })).toEqual([]);
  });

  test("by long-running or not", async () => {
    expect(await list(tasks, { longRunning: true })).toEqual(["project"]);
    expect(await list(tasks, { longRunning: false })).toEqual(["missed", "pay-rent", "report", "request"]);
  });

  test("by a window over the start, or the deadline when there is no start; undated tasks stay out", async () => {
    const from = at("2026-08-15T00:00:00.000Z");
    const to = at("2026-08-18T00:00:00.000Z");

    expect(await list(tasks, { from })).toEqual(["pay-rent", "report"]);
    expect(await list(tasks, { to })).toEqual(["missed", "pay-rent"]);
    expect(await list(tasks, { from, to })).toEqual(["pay-rent"]);
    expect(await list(tasks, { from: at("2026-08-17T12:00:00.000Z"), to: at("2026-08-17T12:00:00.000Z") })).toEqual(["pay-rent"]);
  });

  test("combined, and limited after ordering", async () => {
    expect(await list(tasks, { actor: "human", tag: "casa", longRunning: false })).toEqual(["pay-rent"]);
    expect(await list(tasks, { limit: 2 })).toEqual(["missed", "pay-rent"]);
  });
});

describe("series", () => {
  const occurrence = (day: string, overrides: Partial<Parameters<typeof Task.create>[0]> = {}, detached = false) =>
    task(`rent-${day}`, {
      startedAt: at(`2026-${day}T12:00:00.000Z`),
      occurrence: { recurrenceId: "rec-1", occurrenceOn: `2026-${day}`, detached },
      ...overrides,
    });

  test("a series shows once, by its next open occurrence", async () => {
    expect(await list([occurrence("11-05"), occurrence("09-05"), occurrence("10-05")])).toEqual(["rent-09-05"]);
  });

  test("an occurrence someone edited no longer follows the series and shows by itself", async () => {
    const ids = await list([
      occurrence("09-05", { status: "done" }, true),
      occurrence("10-05", { status: "missed" }, true),
      occurrence("11-05"),
      occurrence("12-05"),
    ]);

    expect(ids).toEqual(["rent-09-05", "rent-10-05", "rent-11-05"]);
  });

  test("the next open occurrence is chosen before the filters: a filter never promotes a later one", async () => {
    const tasks = [occurrence("09-05", { priority: "low" }), occurrence("10-05", { priority: "urgent" })];

    expect(await list(tasks, { priority: ["urgent"] })).toEqual([]);
    expect(await list(tasks, { from: at("2026-10-01T00:00:00.000Z") })).toEqual([]);
  });

  test("each series collapses on its own, and reference occurrences are not tracked at all", async () => {
    const other = task("gym-09-07", {
      startedAt: at("2026-09-07T12:00:00.000Z"),
      occurrence: { recurrenceId: "rec-2", occurrenceOn: "2026-09-07", detached: false },
    });
    const reference = Task.create({
      id: "run",
      userId: actor.userId,
      name: "Correr",
      startedAt: at("2026-09-06T12:00:00.000Z"),
      occurrence: { recurrenceId: "rec-3", occurrenceOn: "2026-09-06", detached: false },
    });

    expect(await list([occurrence("09-05"), occurrence("10-05"), other, reference])).toEqual(["rent-09-05", "gym-09-07"]);
  });
});

describe("wiring", () => {
  test("passes the filters through to the query, scoped to the actor", async () => {
    const asked: TrackedQueryParams[] = [];
    const useCase = new ListTrackedTasksUseCase({
      tracked: async (params) => {
        asked.push(params);
        return [];
      },
    });
    const filter: ListTrackedTasksFilter = {
      actor: "human",
      status: ["todo", "doing"],
      priority: ["high"],
      tag: "casa",
      q: "aluguel",
      from: at("2026-08-01T00:00:00.000Z"),
      to: at("2026-08-31T00:00:00.000Z"),
      longRunning: false,
      limit: 20,
    };

    await useCase.execute(filter, actor);
    await useCase.execute({ userId: "someone-else" } as never, actor);
    await useCase.execute(undefined, actor);

    expect(asked[0]).toEqual({ ...filter, userId: "auth-user-1" });
    expect(asked[1]?.userId).toBe("auth-user-1");
    expect(asked[2]).toEqual({ userId: "auth-user-1" });
  });

  test("generates the series up to the end of the window before reading", async () => {
    const calls: string[] = [];
    const useCase = new ListTrackedTasksUseCase(
      {
        tracked: async () => {
          calls.push("tracked");
          return [];
        },
      },
      {
        materialize: async (userId, until) => {
          calls.push(`materialize ${userId} ${until?.toISOString()}`);
        },
      },
    );

    await useCase.execute({ to: at("2026-12-31T15:00:00.000Z") }, actor);
    await useCase.execute(undefined, actor);

    expect(calls).toEqual([
      "materialize auth-user-1 2026-12-31T15:00:00.000Z",
      "tracked",
      "materialize auth-user-1 undefined",
      "tracked",
    ]);
  });
});
