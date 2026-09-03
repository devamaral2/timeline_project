import { expect, test } from "vitest";
import { mapEventRow, type EventItemRow, type EventRow } from "./event-row.mapper";

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
};

function itemRow(overrides: Partial<EventItemRow>): EventItemRow {
  return {
    id: "01ITEM0000000000000000000",
    eventId: eventRow.id,
    position: 0,
    type: "routine",
    schemaVersion: 1,
    isPrimary: true,
    data: {},
    ...overrides,
  };
}

test("orders items by position and keeps ids stable", () => {
  const first = itemRow({ id: "01ITEM0000000000000000001", position: 1, isPrimary: false });
  const second = itemRow({ id: "01ITEM0000000000000000000", position: 0, isPrimary: true });

  const event = mapEventRow(eventRow, [first, second], [], []);

  expect(event.items.map((item) => item.id)).toEqual([second.id, first.id]);
  expect(event.revision).toBe(3);
});

test("passes the payload through the codec for its schema version", () => {
  const event = mapEventRow(
    eventRow,
    [itemRow({ type: "sleep", data: { trackedSleepTime: 480, score: 80 } })],
    [],
    [],
  );

  expect(event.items[0].data).toEqual({ trackedSleepTime: 480, score: 80 });
});

test("fails with the event and item id when the stored payload is invalid", () => {
  const badItem = itemRow({ id: "01ITEM00000000000000000BAD", data: { extra: true } });

  expect(() => mapEventRow(eventRow, [badItem], [], [])).toThrow(
    /01ITEM00000000000000000BAD.*01EVENT00000000000000000A/,
  );
});
