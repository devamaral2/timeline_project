import { describe, expect, test } from "vitest";
import { Event, type EventCreateProps } from "./event.entity";

const startedAt = new Date("2026-08-31T12:00:00.000Z");

function props(overrides: Partial<EventCreateProps> = {}): EventCreateProps {
  return {
    userId: "user-1",
    name: "Planejamento",
    description: "",
    startedAt,
    tags: [],
    interruptions: [],
    ...overrides,
  };
}

describe("Event aggregate", () => {
  test("creates a routine aggregate with revision 1 and no notes", () => {
    const event = Event.create(props({ tags: [" Trabalho ", "trabalho"] }));

    expect(event.revision).toBe(1);
    expect(event.kind).toBe("routine");
    expect(event.noteLinks).toEqual([]);
    expect(event.tags).toEqual(["trabalho"]);
    expect(event.taskIds).toEqual([]);
  });

  test("a kind needs no note to exist", () => {
    const event = Event.create(props({ kind: "meal" }));

    expect(event.kind).toBe("meal");
    expect(event.noteLinks).toEqual([]);
  });

  test("a new event without a finish gets the typical duration of its kind", () => {
    const minutes = (kind: "routine" | "meal" | "sleep" | "training") =>
      Event.create(props({ kind })).getDurationMinutes();

    expect(minutes("routine")).toBe(60);
    expect(minutes("meal")).toBe(20);
    expect(minutes("sleep")).toBe(7 * 60);
    expect(minutes("training")).toBe(90);
  });

  test("keeps note links in order and revise replaces the whole list", () => {
    const event = Event.create(
      props({
        noteLinks: [
          { noteId: "n1", fromRecurrence: true },
          { noteId: "n2", fromRecurrence: false },
        ],
      }),
    );

    expect(event.noteLinks.map((link) => link.noteId)).toEqual(["n1", "n2"]);

    const reordered = event.revise({
      noteLinks: [
        { noteId: "n2", fromRecurrence: false },
        { noteId: "n1", fromRecurrence: true },
      ],
    });
    expect(reordered.noteLinks.map((link) => link.noteId)).toEqual(["n2", "n1"]);

    const unchanged = event.revise({ name: "Outro" });
    expect(unchanged.noteLinks).toEqual(event.noteLinks);
  });

  test("rejects the same note linked twice", () => {
    expect(() =>
      Event.create(
        props({
          noteLinks: [
            { noteId: "n1", fromRecurrence: false },
            { noteId: "n1", fromRecurrence: false },
          ],
        }),
      ),
    ).toThrow(/Duplicate note link/);
  });

  test("dedupes taskIds and revise replaces the whole list", () => {
    const event = Event.create(props({ taskIds: ["task-1", "task-1", "task-2"] }));

    expect(event.taskIds).toEqual(["task-1", "task-2"]);

    const revised = event.revise({ taskIds: ["task-3"] });
    expect(revised.taskIds).toEqual(["task-3"]);

    const unchanged = event.revise({ name: "Outro" });
    expect(unchanged.taskIds).toEqual(["task-1", "task-2"]);
  });

  test("a new event defaults to a 5-minute-before notification, but rehydrate never invents one", () => {
    const created = Event.create(props());
    expect(created.notifyOffsetsMinutes).toEqual([5]);

    const createdWithoutNotifications = Event.create(props({ notifyOffsetsMinutes: [] }));
    expect(createdWithoutNotifications.notifyOffsetsMinutes).toEqual([]);

    const rehydrated = Event.rehydrate({ ...props({ name: "Existente" }), revision: 5 });
    expect(rehydrated.notifyOffsetsMinutes).toEqual([]);

    const revised = created.revise({ notifyOffsetsMinutes: [15, 60] });
    expect(revised.notifyOffsetsMinutes).toEqual([15, 60]);
    expect(created.notifyOffsetsMinutes).toEqual([5]);
  });

  test("rejects a finishedAt earlier than startedAt", () => {
    expect(() =>
      Event.create(props({ finishedAt: new Date("2026-08-31T11:00:00.000Z") })),
    ).toThrow("finishedAt must be equal to or after startedAt");
  });

  test("rejects a revision below 1 on rehydrate", () => {
    expect(() => Event.rehydrate({ ...props(), revision: 0 })).toThrow(
      "Event revision must be an integer >= 1",
    );
  });

  test("rehydrate keeps the persisted revision and kind instead of incrementing", () => {
    const event = Event.rehydrate({ ...props({ kind: "sleep" }), revision: 5 });

    expect(event.revision).toBe(5);
    expect(event.kind).toBe("sleep");
  });

  test("revise increments the revision, can change the kind and rebuilds the aggregate", () => {
    const event = Event.create(props());

    const revised = event.revise({ name: "Planejamento revisado", kind: "training" });

    expect(revised.revision).toBe(2);
    expect(revised.name).toBe("Planejamento revisado");
    expect(revised.kind).toBe("training");
    expect(event.revision).toBe(1);
    expect(event.kind).toBe("routine");
  });
});
