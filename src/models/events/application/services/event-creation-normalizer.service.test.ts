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
