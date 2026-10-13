import { expect, test } from "vitest";
import { Event, Interruption, Note } from "../../domain";
import { UpdateEventUseCase } from "./update-event.usecase";
import { createEventsKit } from "../../api-core/events/testing/in-memory-events-kit";

function trainingEvent(id: string, interruptions: Interruption[] = []) {
  return Event.create({
    id,
    userId: "auth-user-1",
    name: "Treino",
    description: "Gym session",
    startedAt: new Date("2026-08-16T18:00:00-03:00"),
    tags: ["gym"],
    interruptions,
    kind: "training",
  });
}

function updateUseCaseOf(kit: ReturnType<typeof createEventsKit>) {
  return new UpdateEventUseCase(kit.eventRepository, kit.noteRepository, kit.noteBuilder);
}

test("updates an event without requiring startedAt in the payload", async () => {
  const existingEvent = trainingEvent("01K2R1J5M8S0Y2Z7ABCD123456");
  const kit = createEventsKit({ events: [existingEvent] });
  const eventRepository = kit.eventRepository;
  const updateUseCase = updateUseCaseOf(kit);

  await expect(
    updateUseCase.execute(
      {
        eventId: existingEvent.id,
        expectedRevision: 1,
        description: "Updated description",
        tags: ["focus"],
      },
      { userId: "auth-user-1" },
    ),
  ).resolves.toBeUndefined();

  const savedEvent = await eventRepository.findById(existingEvent.id);
  expect(savedEvent?.description).toBe("Updated description");
  expect(savedEvent?.tags).toEqual(["focus"]);
  expect(savedEvent?.revision).toBe(2);
});

test("appends new interruptions and patches existing ones by id", async () => {
  const existingInterruption = Interruption.create({
    id: "01K2R1J5M8S0Y2Z7ABCD123459",
    name: "Water break",
    description: "Short pause",
    startedAt: new Date("2026-08-16T18:30:00.000Z"),
    finishedAt: new Date("2026-08-16T18:32:00.000Z"),
  });
  const existingEvent = trainingEvent("01K2R1J5M8S0Y2Z7ABCD123456", [existingInterruption]);
  const kit = createEventsKit({ events: [existingEvent] });
  const eventRepository = kit.eventRepository;
  const updateUseCase = updateUseCaseOf(kit);

  await updateUseCase.execute(
    {
      eventId: existingEvent.id,
      expectedRevision: 1,
      interruptions: [
        { id: existingInterruption.id, description: "Updated pause" },
        { name: "Phone call" },
      ],
    },
    { userId: "auth-user-1" },
  );

  const savedEvent = await eventRepository.findById(existingEvent.id);
  expect(savedEvent?.interruptions).toHaveLength(2);
  expect(savedEvent?.interruptions[0]).toMatchObject({
    id: existingInterruption.id,
    name: "Water break",
    description: "Updated pause",
  });
  const appendedInterruption = savedEvent?.interruptions[1];
  expect(appendedInterruption).toBeDefined();
  if (!appendedInterruption) return;
  expect(appendedInterruption.finishedAt.getTime() - appendedInterruption.startedAt.getTime()).toBe(120000);
});

test("replaces a meal note and recalculates totals", async () => {
  const mealNote = Note.create({
    id: "01K2R1J5M8S0Y2Z7ABCD123458",
    userId: "auth-user-1",
    type: "meal",
    data: {
      name: "Almoço",
      description: "rice",
      foodItems: [
        {
          id: "01K2R1J5M8S0Y2Z7ABCDFOOD001",
          name: "Rice",
          portion: "100 g",
          approximateWeightGrams: 100,
          caloriesKcal: 130,
          macronutrients: { carbohydratesGrams: 28, proteinsGrams: 2, totalFatGrams: 0, fiberGrams: 1 },
          micronutrients: {},
        },
      ],
      totals: {
        totalCaloriesKcal: 130,
        totalProteinGrams: 2,
        totalCarbohydrateGrams: 28,
        totalFatGrams: 0,
        totalFiberGrams: 1,
      },
    },
  });
  const existingEvent = Event.create({
    id: "01K2R1J5M8S0Y2Z7ABCD123457",
    userId: "auth-user-1",
    name: "Almoço",
    description: "",
    startedAt: new Date("2026-08-16T12:00:00.000Z"),
    tags: [],
    interruptions: [],
    kind: "meal",
    noteLinks: [{ noteId: mealNote.id, fromRecurrence: false }],
  });
  const kit = createEventsKit({ events: [existingEvent], notes: [mealNote] });

  await updateUseCaseOf(kit).execute(
    {
      eventId: existingEvent.id,
      expectedRevision: 1,
      notes: [
        {
          id: mealNote.id,
          type: "meal",
          data: {
            name: "Almoço",
            description: "rice and beans",
            foodItems: [
              {
                id: "01K2R1J5M8S0Y2Z7ABCDFOOD001",
                name: "Rice",
                portion: "200 g",
                approximateWeightGrams: 200,
                caloriesKcal: 180,
                macronutrients: { carbohydratesGrams: 36, proteinsGrams: 4, totalFatGrams: 1, fiberGrams: 2 },
                micronutrients: {},
              },
              {
                id: "01K2R1J5M8S0Y2Z7ABCDFOOD002",
                name: "Beans",
                portion: "100 g",
                approximateWeightGrams: 100,
                caloriesKcal: 80,
                macronutrients: { carbohydratesGrams: 14, proteinsGrams: 5, totalFatGrams: 0, fiberGrams: 6 },
                micronutrients: {},
              },
            ],
            totals: { totalCaloriesKcal: 0, totalProteinGrams: 0, totalCarbohydrateGrams: 0, totalFatGrams: 0, totalFiberGrams: 0 },
          },
        },
      ],
    },
    { userId: "auth-user-1" },
  );

  const savedEvent = await kit.eventRepository.findById(existingEvent.id);
  const [savedNote] = kit.database.notesOf(savedEvent as Event);
  const mealData = savedNote.data as {
    foodItems: Array<{ id: string; portion: string; caloriesKcal: number }>;
    totals: { totalCaloriesKcal: number };
  };
  expect(savedNote.id).toBe(mealNote.id);
  expect(savedNote.revision).toBe(2);
  expect(mealData.foodItems[0]).toMatchObject({ id: "01K2R1J5M8S0Y2Z7ABCDFOOD001", portion: "200 g", caloriesKcal: 180 });
  expect(mealData.foodItems[1].id).toBe("01K2R1J5M8S0Y2Z7ABCDFOOD002");
  expect(mealData.totals.totalCaloriesKcal).toBe(260);
});

test("updates sleep metrics without retaining unrelated data", async () => {
  const sleepNote = Note.create({ userId: "auth-user-1", type: "sleep", data: { score: 70, trackedSleepTime: 420 } });
  const sleepEvent = Event.create({
    id: "01K2R1J5M8S0Y2Z7ABCD123459",
    userId: "auth-user-1",
    name: "Sono",
    description: "",
    startedAt: new Date("2026-08-16T22:00:00.000Z"),
    tags: [],
    interruptions: [],
    kind: "sleep",
    noteLinks: [{ noteId: sleepNote.id, fromRecurrence: false }],
  });
  const kit = createEventsKit({ events: [sleepEvent], notes: [sleepNote] });

  await updateUseCaseOf(kit).execute(
    {
      eventId: sleepEvent.id,
      expectedRevision: 1,
      notes: [{ id: sleepNote.id, type: "sleep", data: { score: 85, trackedSleepTime: 420 } }],
    },
    { userId: "auth-user-1" },
  );

  const savedEvent = await kit.eventRepository.findById(sleepEvent.id);
  expect(kit.database.notesOf(savedEvent as Event)[0].data).toEqual({ score: 85, trackedSleepTime: 420 });
});

test("creates and links a new note, saving it together with the event", async () => {
  const existingEvent = trainingEvent("01K2R1J5M8S0Y2Z7ABCD123461");
  const kit = createEventsKit({ events: [existingEvent] });

  await updateUseCaseOf(kit).execute(
    {
      eventId: existingEvent.id,
      expectedRevision: 1,
      notes: [{ type: "text", data: { body: "Treino de perna" } }],
    },
    { userId: "auth-user-1" },
  );

  const savedEvent = await kit.eventRepository.findById(existingEvent.id);
  expect(kit.database.notes).toHaveLength(1);
  expect(savedEvent?.noteLinks).toEqual([{ noteId: kit.database.notes[0].id, fromRecurrence: false }]);
  expect(savedEvent?.revision).toBe(2);
});

test("rejects an expectedRevision that does not match the stored event", async () => {
  const existingEvent = trainingEvent("01K2R1J5M8S0Y2Z7ABCD123460");
  const kit = createEventsKit({ events: [existingEvent] });
  const updateUseCase = updateUseCaseOf(kit);

  await expect(
    updateUseCase.execute(
      { eventId: existingEvent.id, expectedRevision: 5, description: "x" },
      { userId: "auth-user-1" },
    ),
  ).rejects.toThrow();
});
