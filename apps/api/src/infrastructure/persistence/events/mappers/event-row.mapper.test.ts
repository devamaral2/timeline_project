import { expect, test } from "vitest";
import { mapEventRow, type EventRow } from "./event-row.mapper";

const eventRow: EventRow = {
  id: "01EVENT00000000000000000A",
  revision: 3,
  userId: "user-1",
  name: "Planejamento",
  description: "",
  startedAt: new Date("2026-08-31T12:00:00.000Z"),
  finishedAt: null,
  missed: false,
  priority: "normal",
  kind: "meal",
  notifyOffsetsMinutes: [5],
};

test("carries the kind and the persisted revision", () => {
  const event = mapEventRow(eventRow, [], [], []);

  expect(event.kind).toBe("meal");
  expect(event.revision).toBe(3);
});

test("keeps the note links in the order they were given", () => {
  const event = mapEventRow(
    eventRow,
    [
      { noteId: "n2", fromRecurrence: false },
      { noteId: "n1", fromRecurrence: true },
    ],
    [],
    [],
  );

  expect(event.noteLinks).toEqual([
    { noteId: "n2", fromRecurrence: false },
    { noteId: "n1", fromRecurrence: true },
  ]);
});

test("defaults to an empty taskIds list and otherwise passes it through", () => {
  const withoutTasks = mapEventRow(eventRow, [], [], []);
  expect(withoutTasks.taskIds).toEqual([]);

  const withTasks = mapEventRow(eventRow, [], [], [], ["task-1"]);
  expect(withTasks.taskIds).toEqual(["task-1"]);
});
