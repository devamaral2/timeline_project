import { expect, test } from "vitest";
import { mealEvaluation } from "./meal-cases";

test("the meal evaluation set is well formed and ids are unique", () => {
  const ids = mealEvaluation.cases.map((entry) => entry.id);
  expect(new Set(ids).size).toBe(ids.length);
});

test("covers the shapes that break meals today", () => {
  const routes = new Set(mealEvaluation.cases.map((entry) => entry.expect.route));
  for (const expected of ["save_meal_event", "finish_event", "read", "complex", "save_recurrence"] as const) {
    expect(routes.has(expected)).toBe(true);
  }
  const kinds = new Set(mealEvaluation.cases.flatMap((entry) => entry.expect.startedAt ? [entry.expect.startedAt.kind] : []));
  expect([...kinds].sort()).toEqual(["absolute", "now", "relative"]);
  expect(mealEvaluation.cases.some((entry) => entry.expect.operation === "update")).toBe(true);
  expect(mealEvaluation.cases.some((entry) => (entry.expect.foods?.length ?? 0) >= 3)).toBe(true);
});

test("includes the original report that motivated the pipeline", () => {
  expect(mealEvaluation.cases[0].text).toBe(
    "Comi 200g de arroz 200g de feijão e 200g de carne moída a uma hora atrás",
  );
});
