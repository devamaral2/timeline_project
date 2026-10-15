import { expect, test } from "vitest";
import { agentChatServerFrameSchema, noteSchema } from "./schemas";

const meal = {
  name: "Almoço", description: "arroz", foodItems: [],
  totals: { totalCaloriesKcal: 0, totalProteinGrams: 0, totalCarbohydrateGrams: 0, totalFatGrams: 0, totalFiberGrams: 0 },
};

test.each(["pending", "completed", "failed"])("meal DTO accepts the %s generation state", (status) => {
  const note = {
    id: "note", name: "Almoço", type: "meal", schemaVersion: 1, tags: [], revision: 1,
    createdAt: "2026-01-01", updatedAt: "2026-01-01",
    data: { ...meal, generation: { status }, ...(status === "completed" ? { nutritionSource: "model-estimate" } : {}) },
  };
  expect(noteSchema.parse(note)).toEqual(note);
});

test("meal generation contract remains strict and legacy meals remain valid", () => {
  const base = { id: "note", name: "Almoço", type: "meal", schemaVersion: 1, tags: [], revision: 1,
    createdAt: "", updatedAt: "", data: meal };
  expect(noteSchema.safeParse(base).success).toBe(true);
  expect(noteSchema.safeParse({ ...base, data: { ...meal, generation: { status: "invented" } } }).success).toBe(false);
  expect(noteSchema.safeParse({ ...base, data: { ...meal, nutritionSource: "catalog" } }).success).toBe(false);
});

test("chat compatibility transport accepts a durable queue receipt", () => {
  const receipt = { type: "queued", id: "request-1", jobId: "job-1" };
  expect(agentChatServerFrameSchema.parse(receipt)).toEqual(receipt);
});
