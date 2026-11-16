import { describe, expect, test } from "vitest";
import { Event } from "../../domain";
import type { TrackedQueryParams } from "../../domain/ports";
import { InMemoryEventCardQuery } from "../../api-core/events/testing/in-memory-event-card.query";
import { InMemoryEventDatabase } from "../../api-core/events/testing/in-memory-event-database";
import { ListTrackedEventsUseCase, type ListTrackedEventsFilter } from "./list-tracked-events.usecase";

const actor = { userId: "auth-user-1" };
const at = (iso: string) => new Date(iso);

function event(id: string, overrides: Partial<Parameters<typeof Event.create>[0]> = {}): Event {
  return Event.create({ id, userId: actor.userId, name: id, status: "todo", ...overrides });
}

async function list(events: Event[], filter?: ListTrackedEventsFilter): Promise<string[]> {
  const useCase = new ListTrackedEventsUseCase(new InMemoryEventCardQuery(new InMemoryEventDatabase(events)));
  return (await useCase.execute(filter, actor)).map((card) => card.id);
}

describe("what the tracked list shows", () => {
  test("events with a status, of people and agents, long-running ones included", async () => {
    const ids = await list([
      event("review"),
      event("project", { longRunning: true }),
      event("request", { actor: "agent", kind: "request", status: "running" }),
      Event.create({ id: "reference", userId: actor.userId, name: "Reunião", startedAt: at("2026-08-17T15:00:00.000Z") }),
      event("step", { actor: "agent", kind: "step", status: "done" }),
      Event.create({ id: "theirs", userId: "someone-else", name: "Deles", status: "todo" }),
    ]);

    expect(ids).toEqual(["project", "request", "review"]);
  });

  test("orders by the start or, without one, by the deadline; events without dates come last", async () => {
    const ids = await list([
      event("undated-b"),
      event("deadline", { estimatedFinishAt: at("2026-08-18T12:00:00.000Z") }),
      event("starts-late", { startedAt: at("2026-08-19T12:00:00.000Z") }),
      event("starts-early", { startedAt: at("2026-08-17T12:00:00.000Z"), estimatedFinishAt: at("2026-08-30T12:00:00.000Z") }),
      event("undated-a"),
    ]);

    expect(ids).toEqual(["starts-early", "deadline", "starts-late", "undated-a", "undated-b"]);
  });

  test("returns cards with the status, the dates as stored and the events they follow", async () => {
    const database = new InMemoryEventDatabase([
      event("project", { longRunning: true }),
      event("review", { status: "inHold", priority: "urgent", estimatedFinishAt: at("2026-08-18T12:00:00.000Z"), tags: ["casa"] }),
    ]);
    database.edges.push({ fromId: "project", toId: "review" });
    const useCase = new ListTrackedEventsUseCase(new InMemoryEventCardQuery(database));

    const cards = await useCase.execute(undefined, actor);

    expect(cards.find((card) => card.id === "review")).toMatchObject({
      status: "inHold",
      priority: "urgent",
      estimatedFinishAt: "2026-08-18T12:00:00.000Z",
      tags: ["casa"],
      previousEventIds: ["project"],
      longRunning: false,
      revision: 1,
    });
    expect(cards.find((card) => card.id === "review")).not.toHaveProperty("missed");
    expect(cards.find((card) => card.id === "project")).toMatchObject({ previousEventIds: [] });
    expect(cards.find((card) => card.id === "project")).not.toHaveProperty("nextEventIds");
  });
});

describe("filters", () => {
  const events = [
    event("pay-rent", { name: "Pagar Aluguel", priority: "urgent", tags: ["casa"], startedAt: at("2026-08-17T12:00:00.000Z") }),
    event("report", { name: "Relatório 100%", status: "doing", priority: "high", estimatedFinishAt: at("2026-08-20T12:00:00.000Z") }),
    event("missed", { name: "Dentista", status: "missed", priority: "low", startedAt: at("2026-08-10T12:00:00.000Z") }),
    event("project", { name: "Reforma", longRunning: true, tags: ["casa"] }),
    event("request", { name: "Pesquisar voos", actor: "agent", kind: "search_request", status: "failed" }),
  ];

  test("by executor", async () => {
    expect(await list(events, { actor: "agent" })).toEqual(["request"]);
    expect(await list(events, { actor: "human" })).toEqual(["missed", "pay-rent", "report", "project"]);
  });

  test("by status, of people or of agents; `missed` is a status like any other", async () => {
    expect(await list(events, { status: ["missed"] })).toEqual(["missed"]);
    expect(await list(events, { status: ["doing", "failed"] })).toEqual(["report", "request"]);
    expect(await list(events, { status: [] })).toHaveLength(5);
  });

  test("by priority", async () => {
    expect(await list(events, { priority: ["urgent", "high"] })).toEqual(["pay-rent", "report"]);
  });

  test("by tag", async () => {
    expect(await list(events, { tag: "casa" })).toEqual(["pay-rent", "project"]);
  });

  test("by a search in the name, case-insensitive and literal", async () => {
    expect(await list(events, { q: "aluguel" })).toEqual(["pay-rent"]);
    expect(await list(events, { q: "100%" })).toEqual(["report"]);
    expect(await list(events, { q: "_" })).toEqual([]);
  });

  test("by long-running or not", async () => {
    expect(await list(events, { longRunning: true })).toEqual(["project"]);
    expect(await list(events, { longRunning: false })).toEqual(["missed", "pay-rent", "report", "request"]);
  });

  test("by a window over the start, or the deadline when there is no start; undated events stay out", async () => {
    const from = at("2026-08-15T00:00:00.000Z");
    const to = at("2026-08-18T00:00:00.000Z");

    expect(await list(events, { from })).toEqual(["pay-rent", "report"]);
    expect(await list(events, { to })).toEqual(["missed", "pay-rent"]);
    expect(await list(events, { from, to })).toEqual(["pay-rent"]);
    expect(await list(events, { from: at("2026-08-17T12:00:00.000Z"), to: at("2026-08-17T12:00:00.000Z") })).toEqual(["pay-rent"]);
  });

  test("combined, and limited after ordering", async () => {
    expect(await list(events, { actor: "human", tag: "casa", longRunning: false })).toEqual(["pay-rent"]);
    expect(await list(events, { limit: 2 })).toEqual(["missed", "pay-rent"]);
  });
});

describe("series", () => {
  const occurrence = (day: string, overrides: Partial<Parameters<typeof Event.create>[0]> = {}, detached = false) =>
    event(`rent-${day}`, {
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
    const events = [occurrence("09-05", { priority: "low" }), occurrence("10-05", { priority: "urgent" })];

    expect(await list(events, { priority: ["urgent"] })).toEqual([]);
    expect(await list(events, { from: at("2026-10-01T00:00:00.000Z") })).toEqual([]);
  });

  test("each series collapses on its own, and reference occurrences are not tracked at all", async () => {
    const other = event("gym-09-07", {
      startedAt: at("2026-09-07T12:00:00.000Z"),
      occurrence: { recurrenceId: "rec-2", occurrenceOn: "2026-09-07", detached: false },
    });
    const reference = Event.create({
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
    const useCase = new ListTrackedEventsUseCase({
      tracked: async (params) => {
        asked.push(params);
        return [];
      },
    });
    const filter: ListTrackedEventsFilter = {
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
    const useCase = new ListTrackedEventsUseCase(
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
