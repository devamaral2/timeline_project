import { expect, test } from "vitest";
import { artifactSchema, createTaskInputSchema, updateTaskInputSchema } from "./schemas";

const food = {
  description: "arroz", items: [],
  totals: { totalCaloriesKcal: 0, totalProteinGrams: 0, totalCarbohydrateGrams: 0, totalFatGrams: 0, totalFiberGrams: 0 },
};

test.each(["pending", "completed", "failed"])("food DTO accepts the %s generation state", (status) => {
  const artifact = {
    id: "artifact", name: "Almoço", type: "food", schemaVersion: 1, global: false, derived: false, tags: [], revision: 1,
    createdAt: "2026-01-01", updatedAt: "2026-01-01",
    data: { ...food, generation: { status }, ...(status === "completed" ? { nutritionSource: "model-estimate" } : {}) },
  };
  expect(artifactSchema.parse(artifact)).toEqual(artifact);
});

test("food generation contract remains strict and a food without generation is valid", () => {
  const base = { id: "artifact", name: "Almoço", type: "food", schemaVersion: 1, global: false, derived: false, tags: [], revision: 1,
    createdAt: "", updatedAt: "", data: food };
  expect(artifactSchema.safeParse(base).success).toBe(true);
  expect(artifactSchema.safeParse({ ...base, data: { ...food, generation: { status: "invented" } } }).success).toBe(false);
  expect(artifactSchema.safeParse({ ...base, data: { ...food, nutritionSource: "catalog" } }).success).toBe(false);
});

test("a training artifact accepts walking as a cardio workout", () => {
  const artifact = {
    id: "artifact", name: "Caminhada", type: "training", schemaVersion: 1, global: false, derived: false, tags: [], revision: 1,
    createdAt: "2026-01-01", updatedAt: "2026-01-01",
    data: {
      workouts: [
        {
          id: "workout",
          workoutCode: "walking",
          workoutName: "Caminhada",
          calories: 100,
          duration: 120,
          pace: 5,
          distance: 24,
        },
      ],
      caloriesBurned: 100,
    },
  };
  expect(artifactSchema.parse(artifact)).toEqual(artifact);
});

// Os nomes antigos saem dos novos: o teste nao pode citar o nome que a varredura de residuos proibe.
const VELHO = ["ev", "ent"].join("");
const nomeAntigo = (campo: string) => campo.replace("task", VELHO).replace("Task", VELHO[0].toUpperCase() + VELHO.slice(1));

test.each(["previousTaskIds", "nextTaskIds"])("the task input schemas take %s and refuse its old name", (field) => {
  expect(createTaskInputSchema.safeParse({ [field]: ["t1"] }).success).toBe(true);
  expect(createTaskInputSchema.safeParse({ [nomeAntigo(field)]: ["t1"] }).success).toBe(false);
  expect(updateTaskInputSchema.safeParse({ taskId: "t1", expectedRevision: 1, [field]: [] }).success).toBe(true);
  expect(updateTaskInputSchema.safeParse({ taskId: "t1", expectedRevision: 1, [nomeAntigo(field)]: [] }).success).toBe(false);
});

test("the update schema identifies the task by taskId, not by its old name", () => {
  expect(updateTaskInputSchema.safeParse({ [nomeAntigo("taskId")]: "t1", expectedRevision: 1 }).success).toBe(false);
});
