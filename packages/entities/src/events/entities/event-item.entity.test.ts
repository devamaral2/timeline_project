import { expect, test } from "vitest";
import { EventItem } from "./event-item.entity";

test("generates an id, validates position and freezes the payload", () => {
  const item = EventItem.create({
    position: 0,
    type: "routine",
    schemaVersion: 1,
    isPrimary: true,
    data: {},
  });

  expect(item.id).toBeTruthy();
  expect(item.position).toBe(0);
  expect(item.schemaVersion).toBe(1);
  expect(() => {
    (item.data as Record<string, unknown>).extra = true;
  }).toThrow();
});

test("preserves a provided id", () => {
  const item = EventItem.create({
    id: "01K4A000000000000000000000",
    position: 0,
    type: "routine",
    schemaVersion: 1,
    isPrimary: true,
    data: {},
  });

  expect(item.id).toBe("01K4A000000000000000000000");
});

test("rejects an invalid position", () => {
  expect(() =>
    EventItem.create({ position: -1, type: "routine", schemaVersion: 1, isPrimary: true, data: {} }),
  ).toThrow();
  expect(() =>
    EventItem.create({ position: 1.5, type: "routine", schemaVersion: 1, isPrimary: true, data: {} }),
  ).toThrow();
  expect(() =>
    EventItem.create({ position: 32768, type: "routine", schemaVersion: 1, isPrimary: true, data: {} }),
  ).toThrow();
});

test("rejects an invalid payload for the item type", () => {
  expect(() =>
    EventItem.create({
      position: 0,
      type: "routine",
      schemaVersion: 1,
      isPrimary: true,
      data: { extra: true },
    }),
  ).toThrow();
});
