import { describe, expect, test } from "vitest";
import { MAX_ARTIFACT_LINKS, type ArtifactLink } from "../types/artifact-link";
import { EventValidationError } from "../errors/event.errors";
import { Event, MAX_EVENT_BLOCK_DAYS, type EventCreateProps, type EventRehydrateProps } from "./event.entity";

const startedAt = new Date("2026-08-31T12:00:00.000Z");
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

function props(overrides: Partial<EventCreateProps> = {}): EventCreateProps {
  return { userId: "user-1", name: "Planejamento", startedAt, ...overrides };
}

function stored(overrides: Partial<EventRehydrateProps> = {}): EventRehydrateProps {
  return { id: "event-1", userId: "user-1", actor: "human", kind: "common", name: "Planejamento", startedAt, revision: 3, ...overrides };
}

const link = (artifactId: string, overrides: Partial<ArtifactLink> = {}): ArtifactLink => ({
  artifactId,
  relation: "uses",
  fromRecurrence: false,
  ...overrides,
});

describe("Event.create", () => {
  test("creates a human routine with revision 1, medium priority and normalized tags", () => {
    const event = Event.create(props({ tags: [" Trabalho ", "trabalho", ""] }));

    expect(event.id).toMatch(/^[0-9A-Z]{26}$/);
    expect(event.actor).toBe("human");
    expect(event.kind).toBe("common");
    expect(event.priority).toBe("medium");
    expect(event.description).toBe("");
    expect(event.revision).toBe(1);
    expect(event.tags).toEqual(["trabalho"]);
    expect(event.longRunning).toBe(false);
    expect(event.data).toEqual({});
    expect(event.artifactLinks).toEqual([]);
    expect(event.previousIds).toEqual([]);
    expect(event.nextIds).toEqual([]);
    expect(event.occurrence).toBeUndefined();
  });

  test("a new event never starts in a sequence: the sequence is not a field of the event", () => {
    const event = Event.create(props({ previousIds: ["p1"], nextIds: ["n1"] } as never));

    expect(event.previousIds).toEqual([]);
    expect(event.nextIds).toEqual([]);
  });

  describe("reference event (no status)", () => {
    test("is a reference event and requires a start", () => {
      expect(Event.create(props()).isReference).toBe(true);
      expect(() => Event.create(props({ startedAt: undefined }))).toThrow("A reference event requires startedAt");
    });

    test("gets the typical duration of its kind when no planned finish was given", () => {
      const minutes = (kind: "common" | "meal" | "sleep" | "training") => {
        const event = Event.create(props({ kind }));
        return ((event.estimatedFinishAt as Date).getTime() - startedAt.getTime()) / MINUTE;
      };

      expect(minutes("common")).toBe(60);
      expect(minutes("meal")).toBe(20);
      expect(minutes("sleep")).toBe(7 * 60);
      expect(minutes("training")).toBe(90);
    });

    test("keeps the planned finish that was given", () => {
      const estimatedFinishAt = new Date(startedAt.getTime() + 15 * MINUTE);

      expect(Event.create(props({ estimatedFinishAt })).estimatedFinishAt).toEqual(estimatedFinishAt);
    });

    test("is born with the default 5-minute notification, unless told otherwise", () => {
      expect(Event.create(props()).notifyOffsetsMinutes).toEqual([5]);
      expect(Event.create(props({ notifyOffsetsMinutes: [] })).notifyOffsetsMinutes).toEqual([]);
      expect(Event.create(props({ notifyOffsetsMinutes: [30, 1440] })).notifyOffsetsMinutes).toEqual([30, 1440]);
    });

    test("never records an actual finish by default", () => {
      expect(Event.create(props()).finishedAt).toBeUndefined();
    });
  });

  describe("tracked event (with status)", () => {
    test("is not a reference event and may have no dates at all", () => {
      const event = Event.create(props({ status: "toDefine", startedAt: undefined }));

      expect(event.isReference).toBe(false);
      expect(event.status).toBe("toDefine");
      expect(event.startedAt).toBeUndefined();
      expect(event.estimatedFinishAt).toBeUndefined();
      expect(event.finishedAt).toBeUndefined();
    });

    test("gets neither a default duration nor a default notification", () => {
      const event = Event.create(props({ status: "todo" }));

      expect(event.startedAt).toEqual(startedAt);
      expect(event.estimatedFinishAt).toBeUndefined();
      expect(event.notifyOffsetsMinutes).toEqual([]);
    });

    test("may have only a planned finish, as a deadline", () => {
      const deadline = new Date("2026-09-05T12:00:00.000Z");
      const event = Event.create(props({ status: "todo", startedAt: undefined, estimatedFinishAt: deadline }));

      expect(event.estimatedFinishAt).toEqual(deadline);
    });

    test("accepts being concluded before its planned start", () => {
      const finishedAt = new Date(startedAt.getTime() - DAY);

      expect(Event.create(props({ status: "done", finishedAt })).finishedAt).toEqual(finishedAt);
    });
  });

  describe("kinds and statuses per actor", () => {
    test("a human event accepts every human kind and status", () => {
      for (const kind of ["common", "meal", "sleep", "training"] as const) {
        expect(Event.create(props({ kind })).kind).toBe(kind);
      }
      for (const status of ["todo", "toDefine", "doing", "inHold", "done", "cancel", "missed"] as const) {
        expect(Event.create(props({ status })).status).toBe(status);
      }
    });

    test("a human event rejects the kinds and statuses of an agent", () => {
      expect(() => Event.create(props({ kind: "request" }))).toThrow("Invalid kind for a human event: request");
      expect(() => Event.create(props({ kind: "step", status: "todo" }))).toThrow(EventValidationError);
      expect(() => Event.create(props({ status: "queued" }))).toThrow("Invalid status for a human event: queued");
      expect(() => Event.create(props({ status: "failed" }))).toThrow(EventValidationError);
    });

    test("an agent event accepts every agent kind and status, with or without dates", () => {
      const kinds = ["request", "search_request", "build_request", "inquiry_request", "review_request", "cron", "step"] as const;
      for (const kind of kinds) {
        expect(Event.create(props({ actor: "agent", kind, status: "queued", startedAt: undefined })).kind).toBe(kind);
      }
      for (const status of ["queued", "running", "waiting", "done", "failed", "cancel"] as const) {
        expect(Event.create(props({ actor: "agent", kind: "request", status })).status).toBe(status);
      }
    });

    test("an agent event always has a status, and only an agent one", () => {
      expect(() => Event.create(props({ actor: "agent", kind: "request" }))).toThrow(
        "An agent event always has one of the agent statuses",
      );
      expect(() => Event.create(props({ actor: "agent", kind: "request", status: "todo" }))).toThrow(EventValidationError);
      expect(() => Event.create(props({ actor: "agent", kind: "request", status: "missed" }))).toThrow(EventValidationError);
    });

    test("an agent event rejects the human kinds, including the default one", () => {
      expect(() => Event.create(props({ actor: "agent", status: "queued" }))).toThrow(
        "Invalid kind for an agent event: default",
      );
      expect(() => Event.create(props({ actor: "agent", kind: "meal", status: "queued" }))).toThrow(EventValidationError);
    });

    test("an agent event gets no default notification", () => {
      expect(Event.create(props({ actor: "agent", kind: "request", status: "queued" })).notifyOffsetsMinutes).toEqual([]);
    });
  });

  describe("long-running event", () => {
    test("is born todo when no status was given, and needs no dates", () => {
      const event = Event.create(props({ longRunning: true, startedAt: undefined }));

      expect(event.longRunning).toBe(true);
      expect(event.status).toBe("todo");
      expect(event.isReference).toBe(false);
      expect(event.estimatedFinishAt).toBeUndefined();
      expect(event.notifyOffsetsMinutes).toEqual([]);
    });

    test("keeps the status that was given", () => {
      expect(Event.create(props({ longRunning: true, status: "doing" })).status).toBe("doing");
    });

    test("is never missed", () => {
      expect(() => Event.create(props({ longRunning: true, status: "missed" }))).toThrow(
        "A long-running event is never missed",
      );
    });

    test("does not repeat", () => {
      const occurrence = { recurrenceId: "rec-1", occurrenceOn: "2026-08-31", detached: false };

      expect(() => Event.create(props({ longRunning: true, occurrence }))).toThrow("A long-running event does not repeat");
    });

    test("only a human event can be long-running", () => {
      expect(() => Event.create(props({ actor: "agent", kind: "request", status: "queued", longRunning: true }))).toThrow(
        "Only a human event can be long-running",
      );
    });

    test("has no notifications without a deadline, and accepts them with one", () => {
      expect(() => Event.create(props({ longRunning: true, notifyOffsetsMinutes: [60] }))).toThrow(
        "A long-running event without a deadline has no notifications",
      );

      const deadline = new Date(startedAt.getTime() + 90 * DAY);
      const event = Event.create(props({ longRunning: true, estimatedFinishAt: deadline, notifyOffsetsMinutes: [60] }));
      expect(event.notifyOffsetsMinutes).toEqual([60]);
    });

    test("may last more than the 31-day cap and may start after its deadline", () => {
      const longer = Event.create(
        props({ longRunning: true, estimatedFinishAt: new Date(startedAt.getTime() + 400 * DAY) }),
      );
      const late = Event.create(props({ longRunning: true, estimatedFinishAt: new Date(startedAt.getTime() - DAY) }));

      expect(longer.longRunning).toBe(true);
      expect(late.estimatedFinishAt?.getTime()).toBeLessThan(startedAt.getTime());
    });
  });

  describe("planned window outside long-running events", () => {
    test("rejects a planned finish before the start, and accepts one equal to it", () => {
      expect(() => Event.create(props({ estimatedFinishAt: new Date(startedAt.getTime() - 1) }))).toThrow(
        "estimatedFinishAt must be equal to or after startedAt",
      );
      expect(Event.create(props({ estimatedFinishAt: startedAt })).estimatedFinishAt).toEqual(startedAt);
    });

    test(`caps the block at ${MAX_EVENT_BLOCK_DAYS} days, for reference and tracked events alike`, () => {
      const atTheCap = new Date(startedAt.getTime() + MAX_EVENT_BLOCK_DAYS * DAY);
      const beyond = new Date(atTheCap.getTime() + 1);

      expect(Event.create(props({ estimatedFinishAt: atTheCap })).estimatedFinishAt).toEqual(atTheCap);
      expect(() => Event.create(props({ estimatedFinishAt: beyond }))).toThrow(
        "An event longer than 31 days must be long-running",
      );
      expect(() => Event.create(props({ status: "todo", estimatedFinishAt: beyond }))).toThrow(EventValidationError);
    });
  });

  describe("relations", () => {
    test("keeps the artifact links in order, with their relation and origin", () => {
      const event = Event.create(
        props({ artifactLinks: [link("a2", { relation: "creates" }), link("a1", { fromRecurrence: true })] }),
      );

      expect(event.artifactLinks).toEqual([
        { artifactId: "a2", relation: "creates", fromRecurrence: false },
        { artifactId: "a1", relation: "uses", fromRecurrence: true },
      ]);
    });

    test("rejects two links to the same artifact", () => {
      expect(() => Event.create(props({ artifactLinks: [link("a1"), link("a1", { relation: "updates" })] }))).toThrow(
        "Duplicate artifact link: a1",
      );
    });

    test("rejects more artifact links than the position column holds", () => {
      const links = Array.from({ length: MAX_ARTIFACT_LINKS + 1 }, (_, index) => link(`a${index}`));

      expect(() => Event.create(props({ artifactLinks: links }))).toThrow(
        `An event accepts at most ${MAX_ARTIFACT_LINKS} artifacts`,
      );
    });

    test("rejects an event that appears in its own sequence", () => {
      expect(() => Event.rehydrate(stored({ id: "event-1", previousIds: ["event-1"] }))).toThrow(
        "Event cannot follow itself",
      );
      expect(() => Event.rehydrate(stored({ id: "event-1", nextIds: ["event-1"] }))).toThrow("Event cannot follow itself");
    });
  });

  describe("field validation", () => {
    test("rejects an unknown priority", () => {
      expect(() => Event.create(props({ priority: "normal" as never }))).toThrow("Invalid event priority: normal");
    });

    test("rejects a notification offset out of bounds and removes repeated ones", () => {
      expect(() => Event.create(props({ notifyOffsetsMinutes: [0] }))).toThrow("Invalid notification offset");
      expect(() => Event.create(props({ notifyOffsetsMinutes: [5.5] }))).toThrow("Invalid notification offset");
      expect(() => Event.create(props({ notifyOffsetsMinutes: [43_201] }))).toThrow("Invalid notification offset");
      expect(Event.create(props({ notifyOffsetsMinutes: [10, 10, 60] })).notifyOffsetsMinutes).toEqual([10, 60]);
    });

    test("rejects data that is not an object", () => {
      expect(() => Event.create(props({ data: [] as never }))).toThrow("Event data must be an object");
      expect(() => Event.create(props({ data: "resumo" as never }))).toThrow("Event data must be an object");
      expect(Event.create(props({ data: { summary: "ok" } })).data).toEqual({ summary: "ok" });
    });
  });
});

describe("Event.rehydrate", () => {
  test("returns the row as it was stored, without the defaults of a new event", () => {
    const event = Event.rehydrate(stored());

    expect(event.isReference).toBe(true);
    expect(event.estimatedFinishAt).toBeUndefined();
    expect(event.notifyOffsetsMinutes).toEqual([]);
    expect(event.revision).toBe(3);
  });

  test("does not give a stored long-running event a status it never had", () => {
    expect(() => Event.rehydrate(stored({ longRunning: true }))).toThrow("A long-running event always has a status");
  });

  test("reads the sequence, without repeats: the events it follows and the ones that follow it", () => {
    const event = Event.rehydrate(stored({ previousIds: ["p1", "p1", "p2"], nextIds: ["n1", "n1"] }));

    expect(event.previousIds).toEqual(["p1", "p2"]);
    expect(event.nextIds).toEqual(["n1"]);
  });

  test("a stored event without a sequence has empty lists", () => {
    const event = Event.rehydrate(stored());

    expect(event.previousIds).toEqual([]);
    expect(event.nextIds).toEqual([]);
  });

  test("still enforces the invariants on what comes from storage", () => {
    expect(() => Event.rehydrate(stored({ startedAt: undefined }))).toThrow("A reference event requires startedAt");
    expect(() => Event.rehydrate(stored({ actor: "agent", kind: "step" }))).toThrow(EventValidationError);
  });

  test("rejects a revision that is not an integer >= 1", () => {
    expect(() => Event.rehydrate(stored({ revision: 0 }))).toThrow("Event revision must be an integer >= 1");
    expect(() => Event.rehydrate(stored({ revision: 1.5 }))).toThrow(EventValidationError);
  });
});

describe("Event.revise", () => {
  test("bumps the revision and keeps the identity and what was not changed", () => {
    const event = Event.create(props({ kind: "training", tags: ["gym"], priority: "high", data: { source: "voice" } }));

    const revised = event.revise({ name: "Treino de perna" });

    expect(revised.revision).toBe(2);
    expect(revised.id).toBe(event.id);
    expect(revised.userId).toBe("user-1");
    expect(revised.name).toBe("Treino de perna");
    expect(revised.kind).toBe("training");
    expect(revised.priority).toBe("high");
    expect(revised.tags).toEqual(["gym"]);
    expect(revised.data).toEqual({ source: "voice" });
    expect(revised.startedAt).toEqual(startedAt);
    expect(revised.estimatedFinishAt).toEqual(event.estimatedFinishAt);
    expect(revised.notifyOffsetsMinutes).toEqual([5]);
    expect(event.revision).toBe(1);
    expect(event.name).toBe("Planejamento");
  });

  test("changes every editable field", () => {
    const estimatedFinishAt = new Date(startedAt.getTime() + 2 * 60 * MINUTE);
    const finishedAt = new Date(startedAt.getTime() + 90 * MINUTE);

    const revised = Event.create(props()).revise({
      kind: "meal",
      status: "done",
      priority: "urgent",
      description: "com a equipe",
      estimatedFinishAt,
      finishedAt,
      notifyOffsetsMinutes: [15],
      tags: ["Time"],
      artifactLinks: [link("a1")],
    });

    expect(revised).toMatchObject({
      kind: "meal",
      status: "done",
      priority: "urgent",
      description: "com a equipe",
      estimatedFinishAt,
      finishedAt,
      notifyOffsetsMinutes: [15],
      tags: ["time"],
      artifactLinks: [link("a1")],
      previousIds: [],
      nextIds: [],
    });
  });

  test("null clears the status and the event goes back to being a reference one", () => {
    const tracked = Event.create(props({ status: "doing" }));

    const revised = tracked.revise({ status: null });

    expect(revised.status).toBeUndefined();
    expect(revised.isReference).toBe(true);
  });

  test("null cannot clear the status of an event without a start", () => {
    const undated = Event.create(props({ status: "todo", startedAt: undefined }));

    expect(() => undated.revise({ status: null })).toThrow("A reference event requires startedAt");
  });

  test("null clears the dates of a tracked event", () => {
    const tracked = Event.create(
      props({
        status: "done",
        estimatedFinishAt: new Date(startedAt.getTime() + 60 * MINUTE),
        finishedAt: new Date(startedAt.getTime() + 50 * MINUTE),
      }),
    );

    const revised = tracked.revise({ startedAt: null, estimatedFinishAt: null, finishedAt: null });

    expect(revised.startedAt).toBeUndefined();
    expect(revised.estimatedFinishAt).toBeUndefined();
    expect(revised.finishedAt).toBeUndefined();
  });

  test("null cannot clear the start of a reference event", () => {
    expect(() => Event.create(props()).revise({ startedAt: null })).toThrow("A reference event requires startedAt");
  });

  test("clearing the planned finish does not bring the default duration back", () => {
    expect(Event.create(props()).revise({ estimatedFinishAt: null }).estimatedFinishAt).toBeUndefined();
  });

  test("undefined keeps the status and the dates", () => {
    const tracked = Event.create(props({ status: "doing", finishedAt: startedAt }));

    const revised = tracked.revise({ status: undefined, startedAt: undefined, finishedAt: undefined });

    expect(revised.status).toBe("doing");
    expect(revised.startedAt).toEqual(startedAt);
    expect(revised.finishedAt).toEqual(startedAt);
  });

  test("replaces the whole list of artifact links, and an empty list empties it", () => {
    const event = Event.create(props({ artifactLinks: [link("a1"), link("a2")] }));

    expect(event.revise({ artifactLinks: [link("a2")] }).artifactLinks).toEqual([link("a2")]);
    expect(event.revise({ artifactLinks: [] }).artifactLinks).toEqual([]);
  });

  test("keeps the sequence as it was read: revising never changes it", () => {
    const event = Event.rehydrate(stored({ previousIds: ["p1"], nextIds: ["n1"] }));

    const revised = event.revise({ name: "Outro nome", previousIds: ["x"], nextIds: [] } as never);

    expect(revised.previousIds).toEqual(["p1"]);
    expect(revised.nextIds).toEqual(["n1"]);
  });

  test("detaches the occurrence from its series, whatever was edited", () => {
    const occurrence = { recurrenceId: "rec-1", occurrenceOn: "2026-08-31", detached: false };
    const event = Event.create(props({ occurrence }));

    expect(event.revise({ description: "editada" }).occurrence).toEqual({ ...occurrence, detached: true });
    expect(event.revise({ name: "Outro" }).occurrence?.detached).toBe(true);
    expect(event.occurrence?.detached).toBe(false);
  });

  test("an event that is not an occurrence stays without a series", () => {
    expect(Event.create(props()).revise({ name: "Outro" }).occurrence).toBeUndefined();
  });

  test("an agent event cannot be revised", () => {
    const request = Event.create(props({ actor: "agent", kind: "request", status: "queued" }));

    expect(() => request.revise({ name: "Outro" })).toThrow("An agent event cannot be edited");
  });

  test("applies the same invariants as a new event", () => {
    const event = Event.create(props());

    expect(() => event.revise({ status: "queued" as never })).toThrow("Invalid status for a human event: queued");
    expect(() => event.revise({ kind: "step" })).toThrow(EventValidationError);
    expect(() => event.revise({ estimatedFinishAt: new Date(startedAt.getTime() - 1) })).toThrow(EventValidationError);
    expect(() => event.revise({ artifactLinks: [link("a1"), link("a1")] })).toThrow("Duplicate artifact link: a1");
  });

  test("turning an event into a long-running one requires a status and no notification without deadline", () => {
    const reference = Event.create(props());
    const tracked = Event.create(props({ status: "todo" }));

    expect(() => reference.revise({ longRunning: true })).toThrow("A long-running event always has a status");
    expect(() => reference.revise({ longRunning: true, status: "todo", estimatedFinishAt: null })).toThrow(
      "A long-running event without a deadline has no notifications",
    );
    expect(tracked.revise({ longRunning: true }).longRunning).toBe(true);
    expect(() => tracked.revise({ longRunning: true, status: "missed" })).toThrow("A long-running event is never missed");
  });

  test("an occurrence cannot become long-running", () => {
    const occurrence = { recurrenceId: "rec-1", occurrenceOn: "2026-08-31", detached: false };
    const event = Event.create(props({ status: "todo", occurrence }));

    expect(() => event.revise({ longRunning: true })).toThrow("A long-running event does not repeat");
  });
});

describe("Event location", () => {
  test("starts empty, is trimmed, and is kept by rehydrate", () => {
    expect(Event.create(props()).location).toBe("");
    expect(Event.create(props({ location: "  Parque Ibirapuera, São Paulo " })).location).toBe("Parque Ibirapuera, São Paulo");
    expect(Event.rehydrate(stored({ location: "Casa" })).location).toBe("Casa");
  });

  test("revise changes it, clears it with an empty text, and keeps it when absent", () => {
    const event = Event.create(props({ location: "Casa" }));
    expect(event.revise({ location: "Escritório" }).location).toBe("Escritório");
    expect(event.revise({ location: "" }).location).toBe("");
    expect(event.revise({ name: "Outro" }).location).toBe("Casa");
  });

  test("refuses a location longer than 300 characters and one on an agent event", () => {
    expect(() => Event.create(props({ location: "a".repeat(301) }))).toThrow(EventValidationError);
    expect(() => Event.rehydrate(stored({ actor: "agent", kind: "request", status: "running", location: "Casa" }))).toThrow(
      EventValidationError,
    );
  });
});
