import { describe, expect, test } from "vitest";
import { Event } from "./event.entity";
import { EventItem } from "./event-item.entity";
import { EventItemRegistry, defaultEventItemRegistry } from "../items/event-item-registry";
import type { EventItemDefinition } from "../items/event-item-definition";

function routineItem(overrides: Partial<Parameters<typeof EventItem.create>[0]> = {}) {
  return EventItem.create({
    position: 0,
    type: "routine",
    schemaVersion: 1,
    isPrimary: true,
    data: {},
    ...overrides,
  });
}

describe("Event aggregate", () => {
  test("creates an aggregate with revision 1 and a derived primary item", () => {
    const routine = routineItem();

    const event = Event.create({
      userId: "user-1",
      name: "Planejamento",
      description: "",
      startedAt: new Date("2026-08-31T12:00:00.000Z"),
      tags: [" Trabalho ", "trabalho"],
      interruptions: [],
      items: [routine],
    });

    expect(event.revision).toBe(1);
    expect(event.primaryItemId).toBe(routine.id);
    expect(event.tags).toEqual(["trabalho"]);
  });

  test("rejects incompatible event items", () => {
    const meal = EventItem.create({
      position: 0,
      type: "meal",
      schemaVersion: 1,
      isPrimary: true,
      data: {
        name: "Almoço",
        description: "",
        foodItems: [],
        totals: {
          totalCaloriesKcal: 0,
          totalProteinGrams: 0,
          totalCarbohydrateGrams: 0,
          totalFatGrams: 0,
          totalFiberGrams: 0,
        },
      },
    });
    const sleep = EventItem.create({
      position: 1,
      type: "sleep",
      schemaVersion: 1,
      isPrimary: false,
      data: { trackedSleepTime: 480, score: 80 },
    });

    expect(() =>
      Event.create({
        userId: "user-1",
        name: "Invalido",
        description: "",
        startedAt: new Date("2026-08-31T12:00:00.000Z"),
        tags: [],
        interruptions: [],
        items: [meal, sleep],
      }),
    ).toThrow("Incompatible event items");
  });

  test("requires exactly one primary item", () => {
    const first = routineItem({ position: 0, isPrimary: false, id: undefined });

    expect(() =>
      Event.create({
        userId: "user-1",
        name: "Sem principal",
        description: "",
        startedAt: new Date("2026-08-31T12:00:00.000Z"),
        tags: [],
        interruptions: [],
        items: [first],
      }),
    ).toThrow("Event requires exactly one primary item");
  });

  test("rejects a duplicate item id", () => {
    const shared = routineItem();
    const second = EventItem.create({
      id: shared.id,
      position: 1,
      type: "routine",
      schemaVersion: 1,
      isPrimary: false,
      data: {},
    });

    expect(() =>
      Event.create({
        userId: "user-1",
        name: "Ids duplicados",
        description: "",
        startedAt: new Date("2026-08-31T12:00:00.000Z"),
        tags: [],
        interruptions: [],
        items: [shared, second],
      }),
    ).toThrow(/Duplicate event item id/);
  });

  test("rejects a duplicate item position", () => {
    const first = routineItem({ position: 0, isPrimary: true });
    const second = EventItem.create({
      position: 0,
      type: "routine",
      schemaVersion: 1,
      isPrimary: false,
      data: {},
    });

    expect(() =>
      Event.create({
        userId: "user-1",
        name: "Posicoes duplicadas",
        description: "",
        startedAt: new Date("2026-08-31T12:00:00.000Z"),
        tags: [],
        interruptions: [],
        items: [first, second],
      }),
    ).toThrow(/Duplicate event item position/);
  });

  test("rejects a primary item that was removed without a substitute", () => {
    const nonPrimary = routineItem({ isPrimary: false });

    expect(() =>
      Event.create({
        userId: "user-1",
        name: "Sem substituto",
        description: "",
        startedAt: new Date("2026-08-31T12:00:00.000Z"),
        tags: [],
        interruptions: [],
        items: [nonPrimary],
      }),
    ).toThrow("Event requires exactly one primary item");
  });

  test("rejects a finishedAt earlier than startedAt", () => {
    expect(() =>
      Event.create({
        userId: "user-1",
        name: "Invalido",
        description: "",
        startedAt: new Date("2026-08-31T12:00:00.000Z"),
        finishedAt: new Date("2026-08-31T11:00:00.000Z"),
        tags: [],
        interruptions: [],
        items: [routineItem()],
      }),
    ).toThrow("finishedAt must be equal to or after startedAt");
  });

  test("rejects a revision below 1 on rehydrate", () => {
    expect(() =>
      Event.rehydrate({
        userId: "user-1",
        name: "Invalido",
        description: "",
        startedAt: new Date("2026-08-31T12:00:00.000Z"),
        tags: [],
        interruptions: [],
        items: [routineItem()],
        revision: 0,
      }),
    ).toThrow("Event revision must be an integer >= 1");
  });

  test("rehydrate keeps the persisted revision instead of incrementing it", () => {
    const event = Event.rehydrate({
      userId: "user-1",
      name: "Existente",
      description: "",
      startedAt: new Date("2026-08-31T12:00:00.000Z"),
      tags: [],
      interruptions: [],
      items: [routineItem()],
      revision: 5,
    });

    expect(event.revision).toBe(5);
  });

  test("revise increments the revision and rebuilds the aggregate", () => {
    const event = Event.create({
      userId: "user-1",
      name: "Planejamento",
      description: "",
      startedAt: new Date("2026-08-31T12:00:00.000Z"),
      tags: [],
      interruptions: [],
      items: [routineItem()],
    });

    const revised = event.revise({ name: "Planejamento revisado" });

    expect(revised.revision).toBe(2);
    expect(revised.name).toBe("Planejamento revisado");
    expect(event.revision).toBe(1);
  });

  test("lets an extension type without incompatibilities coexist with routine", () => {
    const noteDefinition: EventItemDefinition<{ text: string }> = {
      type: "note",
      currentSchemaVersion: 1,
      incompatibleWith: [],
      parse(data) {
        return data as { text: string };
      },
    };
    const registry = new EventItemRegistry([
      ...(["routine", "meal", "sleep", "training"] as const).map(
        (type) => defaultEventItemRegistry.getDefinition(type)!,
      ),
      noteDefinition,
    ]);

    const routine = EventItem.create(
      { position: 0, type: "routine", schemaVersion: 1, isPrimary: true, data: {} },
      registry,
    );
    const note = EventItem.create(
      { position: 1, type: "note", schemaVersion: 1, isPrimary: false, data: { text: "oi" } },
      registry,
    );

    const event = Event.create(
      {
        userId: "user-1",
        name: "Com extensao",
        description: "",
        startedAt: new Date("2026-08-31T12:00:00.000Z"),
        tags: [],
        interruptions: [],
        items: [routine, note],
      },
      registry,
    );

    expect(event.items).toHaveLength(2);
  });
});
