import { expect, test } from "vitest";
import { normalizeCreateEventInput } from "./event-creation-normalizer.service";

test("normalizes creation fields owned by the server", () => {
  const now = new Date("2026-08-17T12:00:00.000Z");

  const normalized = normalizeCreateEventInput(
    { type: "training", description: "Gym session", tags: ["Gym"] },
    now,
  );

  expect(normalized).toMatchObject({
    type: "training",
    name: "Treino",
    description: "Gym session",
    startedAt: now,
    tags: ["Gym"],
    interruptions: [],
    data: { workouts: [] },
  });
  expect(normalized.finishedAt).toBeUndefined();
});

test("defaults optional creation fields", () => {
  const now = new Date("2026-08-17T12:00:00.000Z");

  const normalized = normalizeCreateEventInput({ type: "routine", name: "Planejamento" }, now);

  expect(normalized).toMatchObject({
    type: "routine",
    name: "Planejamento",
    description: "",
    startedAt: now,
    tags: [],
    interruptions: [],
    data: {},
  });
  expect(normalized.finishedAt).toBeUndefined();
});

test.each([
  [3, 0, "Jantar"],
  [3, 1, "Desjejum"],
  [6, 30, "Desjejum"],
  [6, 31, "Café da manhã"],
  [10, 0, "Café da manhã"],
  [10, 1, "Colação"],
  [11, 30, "Colação"],
  [11, 31, "Almoço"],
  [15, 59, "Almoço"],
  [16, 0, "Lanche da tarde"],
  [18, 0, "Lanche da tarde"],
  [18, 1, "Jantar"],
])("uses %s:%s as the food-name boundary for %s", (hours, minutes, expectedName) => {
  const now = new Date(2026, 7, 17, hours, minutes);

  const normalized = normalizeCreateEventInput({ type: "food", inputText: "Meal" }, now);

  expect(normalized.name).toBe(expectedName);
});

test("assigns IDs to new workouts and weightlifting sets", () => {
  const normalized = normalizeCreateEventInput(
    {
      type: "training",
      data: {
        workouts: [
          { type: "running", pace: 320, distance: 5, duration: 25, calories: 320 },
          {
            type: "weightlifting",
            calories: 240,
            duration: 45,
            sets: [{ exercise: "Squat", repetitions: 8, weight: 80 }],
          },
        ],
      },
    },
    new Date("2026-08-17T12:00:00.000Z"),
  );

  if (normalized.type !== "training") throw new Error("Expected a training event");
  expect(normalized.data.workouts[0].id).toMatch(/[0-9A-HJKMNP-TV-Z]{26}/);
  expect(normalized.data.workouts[1].id).toMatch(/[0-9A-HJKMNP-TV-Z]{26}/);
  if (normalized.data.workouts[1].type !== "weightlifting") throw new Error("Expected weightlifting");
  expect(normalized.data.workouts[1].sets[0].id).toMatch(/[0-9A-HJKMNP-TV-Z]{26}/);
});
