import { describe, expect, test } from "vitest";
import { Artifact, Event, Recurrence } from "../../domain";
import { InMemoryEventCardQuery } from "../../api-core/events/testing/in-memory-event-card.query";
import { InMemoryEventDatabase } from "../../api-core/events/testing/in-memory-event-database";
import type { AgendaQueryParams } from "../../domain/ports";
import { ListAgendaEventsUseCase } from "./list-agenda-events.usecase";

const actor = { userId: "auth-user-1" };
const at = (iso: string) => new Date(iso);

function event(id: string, startedAt: string | undefined, overrides: Partial<Parameters<typeof Event.create>[0]> = {}): Event {
  return Event.create({ id, userId: actor.userId, name: id, startedAt: startedAt ? at(startedAt) : undefined, ...overrides });
}

function useCaseOf(events: Event[], artifacts: Artifact[] = [], recurrences: Recurrence[] = []) {
  const database = new InMemoryEventDatabase(events, artifacts);
  const query = new InMemoryEventCardQuery(database, {
    findById: async (id) => recurrences.find((recurrence) => recurrence.id === id) ?? null,
  });
  return new ListAgendaEventsUseCase(query);
}

const idsOf = (page: { items: { id: string }[] }) => page.items.map((item) => item.id);

describe("what the agenda shows", () => {
  test("events with a start, newest first, as cards", async () => {
    const note = Artifact.create({ id: "note-1", userId: actor.userId, data: { body: "pauta" } });
    const useCase = useCaseOf(
      [
        event("morning", "2026-08-17T12:00:00.000Z"),
        event("evening", "2026-08-17T22:00:00.000Z", {
          kind: "meal",
          tags: ["jantar"],
          artifactLinks: [{ artifactId: "note-1", relation: "uses", fromRecurrence: false }],
        }),
        event("noon", "2026-08-17T15:00:00.000Z", { status: "done" }),
      ],
      [note],
    );

    const page = await useCase.execute({}, actor);

    expect(idsOf(page)).toEqual(["evening", "noon", "morning"]);
    expect(page.items[0]).toMatchObject({
      id: "evening",
      actor: "human",
      kind: "meal",
      name: "evening",
      startedAt: "2026-08-17T22:00:00.000Z",
      estimatedFinishAt: "2026-08-17T22:20:00.000Z",
      tags: ["jantar"],
      artifactTypes: ["text"],
      revision: 1,
    });
    expect(page.items[0]).not.toHaveProperty("artifacts");
    expect(page.items[0]).not.toHaveProperty("status");
    expect(page.items[1]?.status).toBe("done");
    expect(page).not.toHaveProperty("nextCursor");
  });

  test("leaves out long-running events, agent steps and events without a start", async () => {
    const useCase = useCaseOf([
      event("reference", "2026-08-17T12:00:00.000Z"),
      event("tracked", "2026-08-17T13:00:00.000Z", { status: "todo" }),
      event("undated", undefined, { status: "toDefine" }),
      event("project", "2026-08-17T14:00:00.000Z", { longRunning: true }),
      event("request", "2026-08-17T15:00:00.000Z", { actor: "agent", kind: "request", status: "done" }),
      event("step", "2026-08-17T15:00:01.000Z", { actor: "agent", kind: "step", status: "done" }),
    ]);

    expect(idsOf(await useCase.execute({}, actor))).toEqual(["request", "tracked", "reference"]);
  });

  test("never shows another user's events", async () => {
    const theirs = Event.create({ id: "theirs", userId: "someone-else", name: "Deles", startedAt: at("2026-08-17T12:00:00.000Z") });

    expect(idsOf(await useCaseOf([theirs, event("mine", "2026-08-17T12:00:00.000Z")]).execute({}, actor))).toEqual(["mine"]);
  });

  test("an occurrence carries the rule of its series", async () => {
    const rule = { frequency: "daily" as const, interval: 1, timeOfDay: "09:00", timeZone: "America/Sao_Paulo", startsOn: "2026-08-01" };
    const series = Recurrence.create({ id: "rec-1", userId: actor.userId, rule, template: { name: "Correr" } });
    const occurrence = { recurrenceId: "rec-1", occurrenceOn: "2026-08-17", detached: false };
    const useCase = useCaseOf([event("run", "2026-08-17T12:00:00.000Z", { occurrence })], [], [series]);

    const page = await useCase.execute({}, actor);

    expect(page.items[0]?.recurrence).toEqual({ id: "rec-1", occurrenceOn: "2026-08-17", detached: false, rule });
  });
});

describe("window", () => {
  const day = { from: at("2026-08-17T03:00:00.000Z"), to: at("2026-08-18T02:59:59.999Z") };
  const window = (events: Event[]) => useCaseOf(events).execute(day, actor);

  test("shows what starts inside the window, bounds included", async () => {
    const page = await window([
      event("before", "2026-08-17T02:59:59.000Z", { estimatedFinishAt: at("2026-08-17T02:59:59.500Z") }),
      event("first", "2026-08-17T03:00:00.000Z"),
      event("last", "2026-08-18T02:59:59.999Z"),
      event("after", "2026-08-18T03:00:00.000Z"),
    ]);

    expect(idsOf(page)).toEqual(["last", "first"]);
  });

  test("shows what started before and is still planned to be running when the window opens", async () => {
    const page = await window([
      event("sleep", "2026-08-16T23:00:00.000Z", { kind: "sleep" }),
      event("ends-at-the-edge", "2026-08-17T02:00:00.000Z", { estimatedFinishAt: at("2026-08-17T03:00:00.000Z") }),
      event("ended", "2026-08-17T01:00:00.000Z", { estimatedFinishAt: at("2026-08-17T02:00:00.000Z") }),
    ]);

    expect(idsOf(page)).toEqual(["ends-at-the-edge", "sleep"]);
  });

  test("without a planned finish, the actual finish decides, and without both the start does", async () => {
    const page = await window([
      event("finished-inside", "2026-08-16T20:00:00.000Z", { status: "done", finishedAt: at("2026-08-17T04:00:00.000Z") }),
      event("finished-before", "2026-08-16T20:00:00.000Z", { status: "done", finishedAt: at("2026-08-16T21:00:00.000Z") }),
      event("open", "2026-08-16T20:00:00.000Z", { status: "doing" }),
      // O fim planejado vem antes do fim real: quem conta e o planejado.
      event("planned-first", "2026-08-16T20:00:00.000Z", {
        status: "done",
        estimatedFinishAt: at("2026-08-16T21:00:00.000Z"),
        finishedAt: at("2026-08-17T04:00:00.000Z"),
      }),
    ]);

    expect(idsOf(page)).toEqual(["finished-inside"]);
  });

  test("only `to` shows everything up to it, only `from` everything still running after it", async () => {
    const events = [event("old", "2026-08-10T12:00:00.000Z"), event("today", "2026-08-17T12:00:00.000Z"), event("next", "2026-08-20T12:00:00.000Z")];

    expect(idsOf(await useCaseOf(events).execute({ to: day.to }, actor))).toEqual(["today", "old"]);
    expect(idsOf(await useCaseOf(events).execute({ from: day.from }, actor))).toEqual(["next", "today"]);
  });
});

describe("filters", () => {
  const events = [
    event("meal", "2026-08-17T15:00:00.000Z", { kind: "meal", tags: ["casa"] }),
    event("routine", "2026-08-17T14:00:00.000Z", { tags: ["trabalho", "casa"] }),
    event("request", "2026-08-17T13:00:00.000Z", { actor: "agent", kind: "search_request", status: "done" }),
  ];

  test("by executor: people and agents together, or each one alone", async () => {
    expect(idsOf(await useCaseOf(events).execute({}, actor))).toEqual(["meal", "routine", "request"]);
    expect(idsOf(await useCaseOf(events).execute({ actor: "human" }, actor))).toEqual(["meal", "routine"]);
    expect(idsOf(await useCaseOf(events).execute({ actor: "agent" }, actor))).toEqual(["request"]);
  });

  test("by kind and by tag", async () => {
    expect(idsOf(await useCaseOf(events).execute({ kind: "meal" }, actor))).toEqual(["meal"]);
    expect(idsOf(await useCaseOf(events).execute({ kind: "search_request" }, actor))).toEqual(["request"]);
    expect(idsOf(await useCaseOf(events).execute({ tag: "casa" }, actor))).toEqual(["meal", "routine"]);
    expect(idsOf(await useCaseOf(events).execute({ tag: "trabalho", kind: "meal" }, actor))).toEqual([]);
  });
});

describe("pages", () => {
  const events = ["a", "b", "c", "d", "e"].map((id, index) => event(id, `2026-08-17T1${index}:00:00.000Z`));

  test("walks the agenda from the newest to the oldest with the cursor", async () => {
    const useCase = useCaseOf(events);

    const first = await useCase.execute({ limit: 2 }, actor);
    const second = await useCase.execute({ limit: 2, cursor: first.nextCursor }, actor);
    const third = await useCase.execute({ limit: 2, cursor: second.nextCursor }, actor);

    expect(idsOf(first)).toEqual(["e", "d"]);
    expect(idsOf(second)).toEqual(["c", "b"]);
    expect(idsOf(third)).toEqual(["a"]);
    expect(first.nextCursor).toEqual(expect.any(String));
    expect(third).not.toHaveProperty("nextCursor");
  });

  test("a page that ends exactly at the last event has no next cursor", async () => {
    const page = await useCaseOf(events).execute({ limit: 5 }, actor);

    expect(page.items).toHaveLength(5);
    expect(page).not.toHaveProperty("nextCursor");
  });

  test("events that start at the same instant are paged by id, without repeats or gaps", async () => {
    const same = ["x1", "x2", "x3"].map((id) => event(id, "2026-08-17T12:00:00.000Z"));
    const useCase = useCaseOf(same);

    const first = await useCase.execute({ limit: 2 }, actor);
    const second = await useCase.execute({ limit: 2, cursor: first.nextCursor }, actor);

    expect([...idsOf(first), ...idsOf(second)]).toEqual(["x3", "x2", "x1"]);
  });

  test("asks for 50 events when no limit is given", async () => {
    const asked: AgendaQueryParams[] = [];
    const useCase = new ListAgendaEventsUseCase({
      agenda: async (params) => {
        asked.push(params);
        return { items: [] };
      },
    });

    await useCase.execute({}, actor);
    await useCase.execute({ limit: 7 }, actor);

    expect(asked.map((params) => params.limit)).toEqual([50, 7]);
    expect(asked[0]?.userId).toBe("auth-user-1");
  });
});

describe("series", () => {
  test("generates the series of the user up to the day asked before reading", async () => {
    const calls: string[] = [];
    const to = at("2026-12-31T15:00:00.000Z");
    const useCase = new ListAgendaEventsUseCase(
      {
        agenda: async () => {
          calls.push("agenda");
          return { items: [] };
        },
      },
      {
        materialize: async (userId, until) => {
          calls.push(`materialize ${userId} ${until?.toISOString()}`);
        },
      },
    );

    await useCase.execute({ to }, actor);
    await useCase.execute({}, actor);

    expect(calls).toEqual([
      "materialize auth-user-1 2026-12-31T15:00:00.000Z",
      "agenda",
      "materialize auth-user-1 undefined",
      "agenda",
    ]);
  });
});
