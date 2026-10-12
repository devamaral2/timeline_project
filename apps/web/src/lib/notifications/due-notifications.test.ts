import { expect, test } from "vitest";
import {
  dueNotificationsOf,
  notificationFeedOf,
  notificationKeyOf,
  type NotificationSource,
} from "./due-notifications";

const NOW = new Date("2026-09-16T12:00:00.000Z").getTime();
const minutes = (value: number) => value * 60_000;

function source(startsInMinutes: number, overrides: Partial<NotificationSource> = {}): NotificationSource {
  return {
    kind: "event",
    id: "event-1",
    name: "Corrida",
    startedAt: new Date(NOW + minutes(startsInMinutes)).toISOString(),
    notifyOffsetsMinutes: [5],
    ...overrides,
  };
}

test("does not fire before the trigger time", () => {
  const result = dueNotificationsOf([source(10)], NOW, new Set());
  expect(result).toEqual({ due: [], settled: [] });
});

test("fires once the trigger is crossed and the item has not started", () => {
  const item = source(3); // trigger was 2 minutes ago
  const result = dueNotificationsOf([item], NOW, new Set());

  expect(result.due).toEqual([
    { key: notificationKeyOf(item, 5), kind: "event", sourceId: "event-1", name: "Corrida", offsetMinutes: 5 },
  ]);
  expect(result.settled).toHaveLength(1);
});

test("never fires a key that already fired", () => {
  const item = source(3);
  const fired = new Set([notificationKeyOf(item, 5)]);
  expect(dueNotificationsOf([item], NOW, fired)).toEqual({ due: [], settled: [] });
});

test("settles silently when the trigger is older than the catch-up window", () => {
  const stale = source(30, { notifyOffsetsMinutes: [120] }); // trigger was 90 minutes ago
  const result = dueNotificationsOf([stale], NOW, new Set());

  expect(result.due).toEqual([]);
  expect(result.settled).toHaveLength(1);
});

test("settles silently when the item already started", () => {
  const result = dueNotificationsOf([source(-10)], NOW, new Set());
  expect(result.due).toEqual([]);
  expect(result.settled).toHaveLength(1);
});

test("rescheduling an event creates a new key", () => {
  expect(notificationKeyOf(source(10), 5)).not.toBe(notificationKeyOf(source(20), 5));
});

test("the feed lists recent notifications newest first and the next upcoming ones", () => {
  const sources: NotificationSource[] = [
    source(3, { id: "a", name: "A" }), // trigger 2 min ago
    source(10, { id: "b", name: "B", notifyOffsetsMinutes: [15] }), // trigger 5 min ago
    source(60, { id: "c", name: "C" }), // trigger in 55 min
    source(30, { id: "d", name: "D", kind: "task" }), // trigger in 25 min
    source(-2000, { id: "old", name: "Old" }), // trigger > 24h ago
  ];

  const feed = notificationFeedOf(sources, NOW);

  expect(feed.recent.map((item) => item.name)).toEqual(["A", "B"]);
  expect(feed.upcoming.map((item) => item.name)).toEqual(["D", "C"]);
  expect(feed.upcoming[0]?.kind).toBe("task");
});
