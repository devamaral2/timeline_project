import { expect, test } from "vitest";
import { applyEntityCommands, emptyEntityPlan } from "./entity-plan.engine";
import type { EntityCommand, EntityPlan } from "./entity-plan.types";

const NOW = new Date("2026-10-26T23:50:53-03:00");

function apply(commands: readonly EntityCommand[], plan: EntityPlan = emptyEntityPlan(NOW)) {
  let next = plan.events.length + plan.notes.length;
  return applyEntityCommands(plan, commands, {
    now: NOW,
    idFactory: () => `01K2R1J5M8S0Y2Z7ABCDFREE${String(next++).padStart(2, "0")}`,
  });
}

function trainingNote(plan: EntityPlan) {
  const note = plan.notes[0];
  if (note.type !== "training") throw new Error(`expected training, got ${note.type}`);
  return note;
}

function mealNote(plan: EntityPlan) {
  const note = plan.notes[0];
  if (note.type !== "meal") throw new Error(`expected meal, got ${note.type}`);
  return note;
}

function textNote(plan: EntityPlan) {
  const note = plan.notes[0];
  if (note.type !== "text") throw new Error(`expected text, got ${note.type}`);
  return note;
}

function sleepNote(plan: EntityPlan) {
  const note = plan.notes[0];
  if (note.type !== "sleep") throw new Error(`expected sleep, got ${note.type}`);
  return note;
}

test("walking creates the training event and the linked training note", () => {
  const { plan, changes } = apply([
    {
      op: "log-training",
      workoutCode: "walking",
      activity: "Caminhada",
      durationMinutes: 120,
      paceMinPerKm: 5,
      calories: 100,
    },
  ]);

  expect(plan.events).toHaveLength(1);
  expect(plan.notes).toHaveLength(1);
  const event = plan.events[0];
  const note = trainingNote(plan);

  expect(event).toMatchObject({
    kind: "training",
    name: "Caminhada",
    startedAt: "2026-10-26T23:50:53.000-03:00",
    finishedAt: "2026-10-27T01:50:53.000-03:00",
    startedOn: "2026-10-26",
    revision: 1,
    noteIds: [note.id],
  });
  expect(note).toMatchObject({
    type: "training",
    name: "Caminhada",
    eventIds: [event.id],
    revision: 1,
  });
  expect(note.data).toEqual({
    workouts: [
      {
        id: expect.any(String),
        workoutCode: "walking",
        workoutName: "Caminhada",
        calories: 100,
        duration: 120,
        pace: 5,
        distance: 24,
      },
    ],
    caloriesBurned: 100,
  });
  expect(changes.createdEventIds).toEqual([event.id]);
  expect(changes.createdNoteIds).toEqual([note.id]);
  expect(changes.updatedEventIds).toEqual([]);
});

test("another walk on the same day is added to the existing event and note", () => {
  const first = apply([
    { op: "log-training", workoutCode: "walking", durationMinutes: 120, paceMinPerKm: 5, calories: 100 },
  ]);
  const { plan, changes } = apply(
    [{ op: "log-training", workoutCode: "walking", durationMinutes: 60, paceMinPerKm: 6, calories: 50 }],
    first.plan,
  );

  expect(plan.events).toHaveLength(1);
  expect(plan.notes).toHaveLength(1);
  const event = plan.events[0];
  const note = trainingNote(plan);

  expect(event.revision).toBe(2);
  expect(note.revision).toBe(2);
  expect(note.data.workouts).toHaveLength(1);
  expect(note.data.workouts[0]).toMatchObject({
    workoutCode: "walking",
    duration: 180,
    distance: 34,
    pace: 5.29,
    calories: 150,
  });
  expect(note.data.caloriesBurned).toBe(150);
  expect(changes.updatedEventIds).toEqual([event.id]);
  expect(changes.updatedNoteIds).toEqual([note.id]);
  expect(changes.createdEventIds).toEqual([]);
});

test("a meal creates a 20-minute meal event, a pending meal note and the link", () => {
  const { plan } = apply([{ op: "log-meal", items: "400g de carne moída" }]);

  expect(plan.events).toHaveLength(1);
  expect(plan.notes).toHaveLength(1);
  const event = plan.events[0];
  const note = mealNote(plan);

  expect(event).toMatchObject({
    kind: "meal",
    name: "Jantar",
    startedAt: "2026-10-26T23:50:53.000-03:00",
    finishedAt: "2026-10-27T00:10:53.000-03:00",
    noteIds: [note.id],
  });
  expect(note).toMatchObject({ type: "meal", name: "Jantar", eventIds: [event.id] });
  expect(note.data).toMatchObject({
    name: "Jantar",
    description: "400g de carne moída",
    foodItems: [],
    generation: { status: "pending" },
  });
  expect(note.data.totals).toEqual({
    totalCaloriesKcal: 0,
    totalProteinGrams: 0,
    totalCarbohydrateGrams: 0,
    totalFatGrams: 0,
    totalFiberGrams: 0,
  });
});

test("another item in the same meal is appended to the existing note", () => {
  const first = apply([{ op: "log-meal", items: "400g de carne moída" }]);
  const { plan } = apply([{ op: "log-meal", items: "100g de arroz" }], first.plan);

  expect(plan.events).toHaveLength(1);
  expect(plan.notes).toHaveLength(1);
  expect(mealNote(plan).data.description).toBe("400g de carne moída; 100g de arroz");
  expect(mealNote(plan).revision).toBe(2);
});

test("routine events carry a text note and merge by name", () => {
  const first = apply([
    { op: "log-routine", name: "Estudar", description: "Inglês", durationMinutes: 30 },
  ]);
  const { plan } = apply(
    [{ op: "log-routine", name: "estudar", description: "Revisão", durationMinutes: 15 }],
    first.plan,
  );

  expect(plan.events).toHaveLength(1);
  expect(plan.notes).toHaveLength(1);
  const note = textNote(plan);
  expect(note.data.body).toBe("Inglês\n\nRevisão");
  expect(note.revision).toBe(2);
});

test("sleep creates the sleep event ending now and the sleep note", () => {
  const { plan } = apply([
    { op: "log-sleep", trackedSleepTimeMinutes: 420, score: 80 },
  ]);

  const event = plan.events[0];
  const note = sleepNote(plan);
  expect(event).toMatchObject({
    kind: "sleep",
    name: "Sono",
    startedAt: "2026-10-26T16:50:53.000-03:00",
    finishedAt: "2026-10-26T23:50:53.000-03:00",
  });
  expect(note.data).toEqual({ trackedSleepTime: 420, score: 80 });
});

test("multiple commands create independent events in one plan", () => {
  const { plan } = apply([
    { op: "log-meal", items: "400g de carne moída" },
    { op: "log-training", workoutCode: "walking", durationMinutes: 120, paceMinPerKm: 5, calories: 100 },
  ]);

  expect(plan.events.map((event) => event.kind)).toEqual(["meal", "training"]);
  expect(plan.notes.map((note) => note.type)).toEqual(["meal", "training"]);
  for (const event of plan.events) {
    expect(event.noteIds).toHaveLength(1);
  }
});

test("merge false keeps a separate event", () => {
  const first = apply([{ op: "log-meal", items: "400g de carne moída" }]);
  const { plan } = apply([{ op: "log-meal", items: "100g de arroz", merge: false }], first.plan);
  expect(plan.events).toHaveLength(2);
  expect(plan.notes).toHaveLength(2);
});

test("a task is created without note and keeps the deadline", () => {
  const { plan, changes } = apply([
    {
      op: "log-task",
      name: "Preparar viagem",
      estimatedFinishAt: "2026-10-28T23:59:00-03:00",
    },
  ]);

  expect(plan.events).toHaveLength(0);
  expect(plan.notes).toHaveLength(0);
  expect(plan.tasks).toHaveLength(1);
  expect(plan.tasks[0]).toMatchObject({
    name: "Preparar viagem",
    status: "todo",
    priority: "medium",
    startedAt: null,
    estimatedFinishAt: "2026-10-28T23:59:00.000-03:00",
    revision: 1,
  });
  expect(changes.createdTaskIds).toEqual([plan.tasks[0].id]);
});

test("a repeated task merges into the open one instead of duplicating", () => {
  const first = apply([{ op: "log-task", name: "Preparar viagem" }]);
  const { plan, changes } = apply(
    [
      {
        op: "log-task",
        name: "preparar viagem",
        description: "Passagens e mala",
        estimatedFinishAt: "2026-10-28T18:00:00-03:00",
      },
    ],
    first.plan,
  );

  expect(plan.tasks).toHaveLength(1);
  expect(plan.tasks[0]).toMatchObject({
    description: "Passagens e mala",
    estimatedFinishAt: "2026-10-28T18:00:00.000-03:00",
    revision: 2,
  });
  expect(changes.updatedTaskIds).toEqual([plan.tasks[0].id]);
  expect(changes.createdTaskIds).toEqual([]);
});

test("a scheduled task starts when told and defaults the status", () => {
  const { plan } = apply([
    {
      op: "log-task",
      name: "Reunião de planejamento",
      startedAt: "2026-10-28T09:00:00-03:00",
      durationMinutes: 60,
    },
  ]);

  expect(plan.tasks[0]).toMatchObject({
    status: "scheduled",
    startedAt: "2026-10-28T09:00:00.000-03:00",
    estimatedFinishAt: "2026-10-28T10:00:00.000-03:00",
  });
});

test("cardio without duration or distance and pace is rejected", () => {
  expect(() => apply([{ op: "log-training", workoutCode: "walking", calories: 100 }])).toThrow(
    "Informe durationMinutes",
  );
});
