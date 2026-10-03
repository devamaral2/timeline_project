import { expect, test } from "vitest";
import { Event, Note } from "../../domain";
import { DeleteEventUseCase } from "../../features/delete-event/delete-event.usecase";
import { UpdateEventUseCase } from "../../features/update-event/update-event.usecase";
import { createEventsKit } from "./testing/in-memory-events-kit";
import { StubMealParsingGateway } from "./testing/stub-meal-parsing.gateway";
import type { MealParsingGateway } from "./gateways/meal-parsing.gateway";

function openTrainingEvent(id: string, startedAt: Date) {
  return Event.create({
    id,
    userId: "auth-user-1",
    name: "Treino",
    description: "",
    startedAt,
    tags: [],
    interruptions: [],
    kind: "training",
  });
}

/** As notes do evento, na ordem dos vinculos. */
function notesOf(kit: ReturnType<typeof createEventsKit>, event: Event | null | undefined): Note[] {
  return event ? kit.database.notesOf(event) : [];
}

test("creates a training event with server-defined timestamps and name", async () => {
  const now = new Date("2026-08-17T12:00:00.000Z");
  const kit = createEventsKit({ clock: () => now });
  const result = await kit.createEvent.execute(
    {
      description: "Gym session",
      tags: ["Gym"],
      kind: "training",
      notes: [{ type: "training", data: { workouts: [{ workoutCode: "running", pace: 320, distance: 5, duration: 25, calories: 320 }] } }],
    },
    { userId: "auth-user-1" },
  );

  expect(result.eventId).toMatch(/[0-9A-HJKMNP-TV-Z]{26}/);
  const savedEvent = await kit.eventRepository.findById(result.eventId);

  expect(savedEvent?.userId).toBe("auth-user-1");
  expect(savedEvent?.kind).toBe("training");
  expect(notesOf(kit, savedEvent).map((note) => note.type)).toEqual(["training"]);
  expect(savedEvent?.name).toBe("Treino");
  expect(savedEvent?.startedAt).toEqual(now);
  // Sem duracao informada, treino estima 1h30.
  expect(savedEvent?.finishedAt).toEqual(new Date(now.getTime() + 90 * 60_000));
  expect(savedEvent?.interruptions).toEqual([]);
  expect(savedEvent?.tags).toEqual(["gym"]);
});

test("creates a sleep event with the fixed name and default optional data", async () => {
  const kit = createEventsKit();
  const result = await kit.createEvent.execute({ kind: "sleep", notes: [{ type: "sleep" }] }, { userId: "auth-user-1" });

  const savedEvent = await kit.eventRepository.findById(result.eventId);

  expect(savedEvent?.name).toBe("Sono");
  expect(notesOf(kit, savedEvent)[0]).toMatchObject({
    type: "sleep",
    data: { trackedSleepTime: 0, score: 0 },
  });
});

test("an event needs no note: the kind alone is enough", async () => {
  const kit = createEventsKit();
  const result = await kit.createEvent.execute({ kind: "sleep" }, { userId: "auth-user-1" });

  const savedEvent = await kit.eventRepository.findById(result.eventId);

  expect(savedEvent?.kind).toBe("sleep");
  expect(savedEvent?.name).toBe("Sono");
  expect(savedEvent?.noteLinks).toEqual([]);
  expect(kit.database.notes).toEqual([]);
});

test("infers the kind from the first typed note when none is given", async () => {
  const kit = createEventsKit();
  const result = await kit.createEvent.execute({ notes: [{ type: "sleep" }] }, { userId: "auth-user-1" });

  expect((await kit.eventRepository.findById(result.eventId))?.kind).toBe("sleep");
});

test("a note without a type is free text and a text note does not change the kind", async () => {
  const kit = createEventsKit();
  const result = await kit.createEvent.execute(
    { name: "Planejamento", notes: [{ data: { body: "Pontos para a reunião" } }] },
    { userId: "auth-user-1" },
  );

  const savedEvent = await kit.eventRepository.findById(result.eventId);
  const [note] = notesOf(kit, savedEvent);

  expect(savedEvent?.kind).toBe("routine");
  expect(note).toMatchObject({ type: "text", name: "Pontos para a reunião", data: { body: "Pontos para a reunião" } });
});

test("keeps the order of the given notes and links existing notes after the new ones", async () => {
  const existing = Note.create({ userId: "auth-user-1", data: { body: "já existia" } });
  const kit = createEventsKit({ notes: [existing] });
  const result = await kit.createEvent.execute(
    {
      name: "Reunião",
      notes: [{ data: { body: "primeira" } }, { data: { body: "segunda" } }],
      noteIds: [existing.id],
    },
    { userId: "auth-user-1" },
  );

  const savedEvent = await kit.eventRepository.findById(result.eventId);

  expect(notesOf(kit, savedEvent).map((note) => (note.data as { body: string }).body)).toEqual([
    "primeira",
    "segunda",
    "já existia",
  ]);
  expect(savedEvent?.noteLinks.every((link) => link.fromRecurrence === false)).toBe(true);
});

test("refuses to link a note that does not exist or belongs to someone else", async () => {
  const foreign = Note.create({ userId: "auth-user-2", data: { body: "de outro" } });
  const kit = createEventsKit({ notes: [foreign] });

  await expect(
    kit.createEvent.execute({ name: "Reunião", noteIds: ["01HZZZZZZZZZZZZZZZZZZZZZZZ"] }, { userId: "auth-user-1" }),
  ).rejects.toThrow("Note not found");
  await expect(
    kit.createEvent.execute({ name: "Reunião", noteIds: [foreign.id] }, { userId: "auth-user-1" }),
  ).rejects.toThrow("Only the note owner can modify it");
  expect(kit.database.events).toEqual([]);
});

test("keeps routine names supplied by the user", async () => {
  const kit = createEventsKit();
  const result = await kit.createEvent.execute({ name: "Planejamento" }, { userId: "auth-user-1" });

  expect((await kit.eventRepository.findById(result.eventId))?.name).toBe("Planejamento");
});

test("estimates finishedAt from the kind when none is informed", async () => {
  const now = new Date("2026-08-17T12:00:00.000Z");
  const kit = createEventsKit({ clock: () => now });

  const meal = await kit.createEvent.execute({ notes: [{ type: "meal", data: { inputText: "banana" } }] }, { userId: "auth-user-1" });
  const sleep = await kit.createEvent.execute({ kind: "sleep", notes: [{ type: "sleep" }] }, { userId: "auth-user-1" });
  const routine = await kit.createEvent.execute({ name: "Planejamento" }, { userId: "auth-user-1" });

  expect((await kit.eventRepository.findById(meal.eventId))?.finishedAt).toEqual(new Date(now.getTime() + 20 * 60_000));
  expect((await kit.eventRepository.findById(sleep.eventId))?.finishedAt).toEqual(new Date(now.getTime() + 7 * 60 * 60_000));
  expect((await kit.eventRepository.findById(routine.eventId))?.finishedAt).toEqual(new Date(now.getTime() + 60 * 60_000));
});

test("requires a name when the event is a routine", async () => {
  const kit = createEventsKit();

  await expect(kit.createEvent.execute({}, { userId: "auth-user-1" })).rejects.toThrow("Event requires a name");
});

test("rejects an unknown kind", async () => {
  const kit = createEventsKit();

  await expect(
    kit.createEvent.execute({ name: "x", kind: "party" as never }, { userId: "auth-user-1" }),
  ).rejects.toThrow("Unknown event kind");
});

test("leaves an earlier event alone when creating a new one", async () => {
  const earlierEvent = openTrainingEvent("01K2TESTOPENEVENT1234567890", new Date("2026-08-17T08:00:00-03:00"));
  const kit = createEventsKit({ events: [earlierEvent] });

  const result = await kit.createEvent.execute({ name: "Planejamento" }, { userId: "auth-user-1" });
  const untouched = await kit.eventRepository.findById(earlierEvent.id);

  // Criar um evento nao mexe em outro: dois eventos podem se sobrepor.
  expect(untouched?.finishedAt).toEqual(earlierEvent.finishedAt);
  expect(untouched?.revision).toBe(earlierEvent.revision);
  expect(result.eventId).toBeDefined();
});

test("starts the event when the input says, in the past or in the future", async () => {
  const kit = createEventsKit();

  const { eventId } = await kit.createEvent.execute(
    {
      name: "Dentista",
      startedAt: "2099-03-04T13:00:00.000Z",
      finishedAt: "2099-03-04T14:00:00.000Z",
    },
    { userId: "auth-user-1" },
  );

  const stored = await kit.eventRepository.findById(eventId);
  expect(stored?.startedAt.toISOString()).toBe("2099-03-04T13:00:00.000Z");
  expect(stored?.finishedAt?.toISOString()).toBe("2099-03-04T14:00:00.000Z");
});

test("refuses an unparseable startedAt", async () => {
  const kit = createEventsKit();

  await expect(
    kit.createEvent.execute({ name: "Dentista", startedAt: "amanha" }, { userId: "auth-user-1" }),
  ).rejects.toThrow("Invalid date");
});

test("keeps the previous event untouched and saves no note when meal parsing fails", async () => {
  const existingEvent = openTrainingEvent("01K2TESTOPENFAILURE12345678", new Date("2026-08-17T08:00:00-03:00"));
  const failingGateway: MealParsingGateway = {
    parseMeal: async () => {
      throw new Error("meal parsing failed");
    },
  };
  const kit = createEventsKit({ events: [existingEvent], mealParsingGateway: failingGateway });

  await expect(
    kit.createEvent.execute({ notes: [{ type: "meal", data: { inputText: "banana" } }] }, { userId: "auth-user-1" }),
  ).rejects.toThrow("meal parsing failed");

  await expect(kit.eventRepository.findById(existingEvent.id)).resolves.toMatchObject({
    finishedAt: existingEvent.finishedAt,
  });
  expect(kit.database.notes).toEqual([]);
});

test("prevents a different user from updating an existing event", async () => {
  const existingEvent = openTrainingEvent("01K2R1J5M8S0Y2Z7ABCD123456", new Date("2026-08-16T18:00:00-03:00"));
  const kit = createEventsKit({ events: [existingEvent] });

  await expect(
    new UpdateEventUseCase(kit.eventRepository, kit.noteRepository, kit.noteBuilder).execute(
      { eventId: existingEvent.id, expectedRevision: 1 },
      { userId: "auth-user-2" },
    ),
  ).rejects.toThrow("Only the event owner can modify it");
});

test("deletes an event when the authenticated user is the owner", async () => {
  const existingEvent = openTrainingEvent("01K2R1J5M8S0Y2Z7ABCD123457", new Date("2026-08-16T06:00:00-03:00"));
  const kit = createEventsKit({ events: [existingEvent] });

  await new DeleteEventUseCase(kit.eventRepository).execute(
    { eventId: existingEvent.id },
    { userId: "auth-user-1" },
  );

  await expect(kit.eventRepository.findById(existingEvent.id)).resolves.toBeNull();
});

test("creates a meal event from parsed AI items and calculated totals", async () => {
  const now = new Date("2026-08-17T12:00:00.000Z");
  const kit = createEventsKit({
    clock: () => now,
    mealParsingGateway: new StubMealParsingGateway({
      items: [
        {
          food: "Banana prata",
          portion: "1 unidade media",
          approximateWeightGrams: 100,
          caloriesKcal: 89,
          macronutrients: {
            carbohydratesGrams: 22.8,
            proteinsGrams: 1.1,
            totalFatGrams: 0.3,
            fiberGrams: 2.6,
          },
          mainMicronutrients: {
            potassiumMg: 358,
            magnesiumMg: 27,
          },
          otherData: {
            sodiumMg: 1,
          },
        },
        {
          food: "Iogurte natural tradicional",
          portion: "2 colheres de sopa",
          approximateWeightGrams: 40,
          caloriesKcal: 45,
          macronutrients: {
            carbohydratesGrams: 4,
            proteinsGrams: 3,
            totalFatGrams: 1.5,
            fiberGrams: 0,
          },
          mainMicronutrients: {
            calciumMg: 48,
          },
          otherData: {
            sodiumMg: 18,
          },
        },
      ],
      modelProvider: "openrouter",
      modelName: "test-model",
    }),
  });

  const result = await kit.createEvent.execute(
    {
      description: "Banana, iogurte e morango",
      tags: ["Breakfast"],
      notes: [{ type: "meal", data: { inputText: "1 banana. 2 colheres de iogurte natural e 5 morangos" } }],
    },
    { userId: "auth-user-1" },
  );

  expect(result.eventId).toBeDefined();
  const savedEvent = await kit.eventRepository.findById(result.eventId);
  const [mealNote] = notesOf(kit, savedEvent);

  expect(savedEvent?.kind).toBe("meal");
  expect(mealNote?.type).toBe("meal");
  expect(mealNote?.data).toMatchObject({
    description: "1 banana. 2 colheres de iogurte natural e 5 morangos",
    totals: {
      totalCaloriesKcal: 134,
      totalProteinGrams: 4.1,
      totalCarbohydrateGrams: 26.8,
      totalFatGrams: 1.8,
      totalFiberGrams: 2.6,
    },
  });

  expect(savedEvent?.startedAt).toEqual(now);
  expect(mealNote).toBeDefined();
  if (!mealNote) return;
  const foodItems = (mealNote.data as { foodItems: Array<{ id: string; micronutrients: Record<string, number> }> }).foodItems;
  expect(foodItems[0].id).toMatch(/[0-9A-HJKMNP-TV-Z]{26}/);
  expect(foodItems[1].id).toMatch(/[0-9A-HJKMNP-TV-Z]{26}/);
  expect(foodItems[0].micronutrients).toMatchObject({ potassiumMg: 358, magnesiumMg: 27, sodiumMg: 1 });
  expect(savedEvent?.tags).toEqual(["breakfast"]);
});
