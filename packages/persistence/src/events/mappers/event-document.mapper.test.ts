import { expect, test } from "vitest";
import { RoutineEvent } from "@repo/entities";
import { SleepEvent } from "@repo/entities";
import { TrainingEvent } from "@repo/entities";
import { Interruption } from "@repo/entities";
import { EventDocumentMapper } from "./event-document.mapper";

test("maps a training event to and from persistence", () => {
  const event = TrainingEvent.create({
    userId: "user-1",
    name: "Leg day",
    description: "Gym session",
    startedAt: new Date("2026-08-16T18:00:00-03:00"),
    finishedAt: new Date("2026-08-16T19:00:00-03:00"),
    tags: ["gym", "legs"],
    interruptions: [
      Interruption.create({
        id: "01K2R1J5M8S0Y2Z7ABCD123459",
        name: "Water break",
        description: "Short pause",
        startedAt: new Date("2026-08-16T18:20:00-03:00"),
        finishedAt: new Date("2026-08-16T18:25:00-03:00"),
      }),
    ],
    data: { workouts: [{ type: "free", calories: 420, duration: 60 }] },
  });

  const document = EventDocumentMapper.toPersistence(event);
  const restored = EventDocumentMapper.toDomain(document);

  expect(document.type).toBe("training");
  expect(restored).toBeInstanceOf(TrainingEvent);
  expect(restored.tags).toEqual(["gym", "legs"]);
  expect(document.interruptions[0].id).toBe("01K2R1J5M8S0Y2Z7ABCD123459");
  expect(restored.interruptions[0].id).toBe("01K2R1J5M8S0Y2Z7ABCD123459");
  expect((restored as TrainingEvent).data.workouts[0].id).toMatch(/[0-9A-HJKMNP-TV-Z]{26}/);
});

test("omits undefined fields from persistence documents", () => {
  const event = RoutineEvent.create({
    userId: "user-1",
    name: "Morning routine",
    description: "Start the day",
    startedAt: new Date("2026-08-16T07:00:00-03:00"),
    tags: ["routine"],
    interruptions: [],
    data: {},
  });

  const document = EventDocumentMapper.toPersistence(event);

  expect(document).not.toHaveProperty("finishedAt");
});

test("preserves server-derived fields for an open sleep event", () => {
  const event = SleepEvent.create({
    id: "01K2R1J5M8S0Y2Z7ABCD123460",
    userId: "user-1",
    name: "Sono",
    description: "",
    startedAt: new Date("2026-08-17T08:00:00.000Z"),
    tags: [],
    interruptions: [],
    data: { trackedSleepTime: 0, score: 0 },
  });

  const document = EventDocumentMapper.toPersistence(event);
  const restored = EventDocumentMapper.toDomain(document);

  expect(document).toMatchObject({
    name: "Sono",
    startedAt: "2026-08-17T08:00:00.000Z",
    interruptions: [],
  });
  expect(document).not.toHaveProperty("finishedAt");
  expect(restored).toMatchObject({ name: "Sono", interruptions: [] });
  expect(restored.finishedAt).toBeUndefined();
  expect(restored.startedAt.toISOString()).toBe("2026-08-17T08:00:00.000Z");
});

test("hydrates legacy training documents without nested item ids", () => {
  const restored = EventDocumentMapper.toDomain({
    id: "01K2R1J5M8S0Y2Z7ABCD123458",
    type: "training",
    userId: "user-1",
    name: "Leg day",
    description: "Gym session",
    startedAt: "2026-08-16T18:00:00-03:00",
    finishedAt: "2026-08-16T19:00:00-03:00",
    tags: ["gym", "legs"],
    interruptions: [
      {
        name: "Water break",
        description: "Short pause",
        startedAt: "2026-08-16T18:20:00-03:00",
        finishedAt: "2026-08-16T18:25:00-03:00",
      },
    ],
    data: {
      workouts: [
        {
          type: "weightlifting",
          calories: 420,
          duration: 60,
          sets: [{ exercise: "Squat", repetitions: 8, weight: 100 }],
        },
      ],
    },
    createdAt: "2026-08-16T19:00:00.000Z",
    updatedAt: "2026-08-16T19:00:00.000Z",
  });

  expect(restored).toBeInstanceOf(TrainingEvent);
  expect(restored.interruptions[0].id).toMatch(/[0-9A-HJKMNP-TV-Z]{26}/);
  const workout = (restored as TrainingEvent).data.workouts[0];
  expect(workout.id).toMatch(/[0-9A-HJKMNP-TV-Z]{26}/);
  expect(workout.type).toBe("weightlifting");
  if (workout.type !== "weightlifting") {
    throw new Error("expected weightlifting workout");
  }
  expect(workout.sets[0].id).toMatch(/[0-9A-HJKMNP-TV-Z]{26}/);
});

test("hydrates training documents from the legacy calories-only schema", () => {
  const restored = EventDocumentMapper.toDomain({
    id: "01K2R1J5M8S0Y2Z7ABCD123461",
    type: "training",
    userId: "user-1",
    name: "Legacy training",
    description: "",
    startedAt: "2026-08-16T18:00:00-03:00",
    finishedAt: "2026-08-16T19:00:00-03:00",
    tags: [],
    interruptions: [],
    data: { caloriesBurned: 420 },
    createdAt: "2026-08-16T19:00:00.000Z",
    updatedAt: "2026-08-16T19:00:00.000Z",
  });

  expect(restored).toBeInstanceOf(TrainingEvent);
  expect((restored as TrainingEvent).data).toEqual({ caloriesBurned: 420, workouts: [] });
});


/**
 * O Firestore nao valida documento nenhum. Os que foram gravados antes da marca
 * de nao realizado vem sem ela, e a leitura tem que continuar funcionando — nao
 * ha migracao por tras disso.
 */
test("reads a document written before the missed flag existed", () => {
  const legacy = {
    id: "01K2R1J5M8S0Y2Z7ABCD123461",
    type: "routine",
    userId: "user-1",
    name: "Bloco de trabalho",
    description: "",
    startedAt: "2026-08-16T12:00:00.000Z",
    finishedAt: "2026-08-16T14:00:00.000Z",
    tags: [],
    interruptions: [],
    data: {},
    createdAt: "2026-08-16T12:00:00.000Z",
    updatedAt: "2026-08-16T12:00:00.000Z",
  } as unknown as Parameters<typeof EventDocumentMapper.toDomain>[0];

  const restored = EventDocumentMapper.toDomain(legacy);

  expect(restored.missed).toBe(false);
  expect(restored.priority).toBe("normal");
});

test("reads the missed status of the previous version as the flag", () => {
  // O ciclo de vida antigo continua gravado nos documentos, e so o `missed`
  // dele dizia que o usuario nao compareceu.
  const previous = {
    id: "01K2R1J5M8S0Y2Z7ABCD123462",
    type: "routine",
    userId: "user-1",
    name: "Consulta",
    description: "",
    startedAt: "2026-08-16T12:00:00.000Z",
    tags: [],
    interruptions: [],
    data: {},
    status: "missed",
    priority: "urgent",
    createdAt: "2026-08-16T12:00:00.000Z",
    updatedAt: "2026-08-16T12:00:00.000Z",
  } as unknown as Parameters<typeof EventDocumentMapper.toDomain>[0];

  const restored = EventDocumentMapper.toDomain(previous);

  expect(restored.missed).toBe(true);
  expect(restored.priority).toBe("urgent");
});

test("falls back to the default when the stored values are not ones we know", () => {
  const event = RoutineEvent.create({
    userId: "user-1",
    name: "Bloco de trabalho",
    description: "",
    startedAt: new Date("2026-08-16T09:00:00-03:00"),
    tags: [],
    interruptions: [],
    data: {},
  });
  const corrupted = {
    ...EventDocumentMapper.toPersistence(event),
    missed: "sim",
    priority: "altissima",
  } as unknown as Parameters<typeof EventDocumentMapper.toDomain>[0];

  const restored = EventDocumentMapper.toDomain(corrupted);

  expect(restored.missed).toBe(false);
  expect(restored.priority).toBe("normal");
});

test("round-trips the mark and the priority the user chose", () => {
  const event = RoutineEvent.create({
    userId: "user-1",
    name: "Consulta",
    description: "",
    startedAt: new Date("2026-08-16T09:00:00-03:00"),
    tags: [],
    interruptions: [],
    data: {},
    missed: true,
    priority: "urgent",
  });

  const restored = EventDocumentMapper.toDomain(EventDocumentMapper.toPersistence(event));

  expect(restored.missed).toBe(true);
  expect(restored.priority).toBe("urgent");
});
