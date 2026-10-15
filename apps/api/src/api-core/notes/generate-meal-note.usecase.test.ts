import { expect, test, vi } from "vitest";
import { calculateMealTotals, Note, type MealItem } from "../../domain";
import type { MealNoteGenerationPayload, MealNoteGenerationRepository } from "../../domain/ports";
import { GenerateMealNoteUseCase } from "./generate-meal-note.usecase";

function setup() {
  const data: MealItem = {
    name: "Almoço", description: "banana", foodItems: [], totals: calculateMealTotals([]),
    generation: { status: "pending" },
  };
  const note = Note.create({ userId: "user-1", type: "meal", data });
  const payload: MealNoteGenerationPayload = {
    noteId: note.id, userId: note.userId, expectedRevision: note.revision,
    description: data.description, name: data.name,
  };
  const repository: MealNoteGenerationRepository = {
    findById: vi.fn().mockResolvedValue(note),
    finishMealGeneration: vi.fn().mockResolvedValue(true),
  };
  const response = {
    items: [{
      food: "Banana", portion: "1 unidade", approximateWeightGrams: 100, caloriesKcal: 89,
      macronutrients: { carbohydratesGrams: 22.8, proteinsGrams: 1.1, totalFatGrams: 0.3, fiberGrams: 2.6 },
    }],
    recipe: { source: "model" as const, ingredients: [{ name: "Banana", quantity: "1 unidade" }], steps: ["Descasque e sirva."] },
    modelProvider: "stub", modelName: "stub",
  };
  const gateway = { parseMeal: vi.fn().mockResolvedValue(response) };
  return { note, payload, repository, gateway, response, worker: new GenerateMealNoteUseCase(repository, gateway) };
}

test("generates only from payload description, without catalog/query tools, with deterministic totals", async () => {
  const { worker, payload, gateway, repository } = setup();
  await expect(worker.execute(payload)).resolves.toEqual({ status: "completed", noteId: payload.noteId });
  expect(gateway.parseMeal).toHaveBeenCalledTimes(1);
  expect(gateway.parseMeal).toHaveBeenCalledWith({ text: "banana" });
  expect(repository.finishMealGeneration).toHaveBeenCalledWith(payload, expect.objectContaining({
    description: "banana", generation: { status: "completed" }, nutritionSource: "model-estimate",
    totals: { totalCaloriesKcal: 89, totalProteinGrams: 1.1, totalCarbohydrateGrams: 22.8, totalFatGrams: 0.3, totalFiberGrams: 2.6 },
    recipe: expect.objectContaining({ source: "model" }),
    foodItems: [expect.not.objectContaining({ sourceFoodId: expect.anything() })],
  }), { status: "completed", noteId: payload.noteId });
});

test.each(["deleted", "foreign", "revision", "input", "completed"] as const)("skips %s note before calling provider", async (scenario) => {
  const { worker, payload, note, repository, gateway } = setup();
  const replacement = scenario === "deleted" ? null : Note.rehydrate({
    ...note,
    userId: scenario === "foreign" ? "other-user" : note.userId,
    revision: scenario === "revision" ? 2 : 1,
    data: {
      ...(note.data as MealItem),
      ...(scenario === "input" ? { description: "different description" } : {}),
      ...(scenario === "completed" ? { generation: undefined } : {}),
    },
  });
  vi.mocked(repository.findById).mockResolvedValue(replacement);
  await expect(worker.execute(payload)).resolves.toEqual({ status: "skipped", noteId: payload.noteId });
  expect(gateway.parseMeal).not.toHaveBeenCalled();
  expect(repository.finishMealGeneration).toHaveBeenCalledWith(payload, null, { status: "skipped", noteId: payload.noteId });
});

test("a revision/deletion race while provider runs skips persistence via repository compare-and-set", async () => {
  const { worker, payload, repository } = setup();
  vi.mocked(repository.finishMealGeneration).mockResolvedValue(false);
  await expect(worker.execute(payload)).resolves.toEqual({ status: "skipped", noteId: payload.noteId });
});

test.each(["recipe", "nutrition"] as const)("rejects malformed generated %s before any persistence", async (invalid) => {
  const { worker, payload, response, gateway, repository } = setup();
  gateway.parseMeal.mockResolvedValue(invalid === "recipe"
    ? { ...response, recipe: undefined }
    : { ...response, items: [{ ...response.items[0], caloriesKcal: -1 }] });
  await expect(worker.execute(payload)).rejects.toThrow();
  expect(repository.finishMealGeneration).not.toHaveBeenCalled();
});

test("provider failure throws for runtime retry; terminal failure safely persists failed state", async () => {
  const { worker, payload, gateway, repository } = setup();
  gateway.parseMeal.mockRejectedValue(new Error("unavailable"));
  await expect(worker.execute(payload)).rejects.toThrow("unavailable");
  expect(repository.finishMealGeneration).not.toHaveBeenCalled();
  await expect(worker.fail(payload)).resolves.toEqual({ status: "failed", noteId: payload.noteId });
  expect(repository.finishMealGeneration).toHaveBeenCalledWith(payload, expect.objectContaining({
    generation: { status: "failed" }, foodItems: [], description: payload.description,
  }), { status: "failed", noteId: payload.noteId });
});

test("manual edits cannot overwrite pending generation or strand it by revising metadata", () => {
  const { note } = setup();
  expect(() => note.revise({ data: note.data })).toThrow("Pending meal generation");
  expect(() => note.revise({ name: "New name" })).toThrow("Pending meal generation");
  expect(() => note.revise({ tags: ["tag"] })).toThrow("Pending meal generation");
});

test("generation state validates while legacy meal snapshots remain readable", () => {
  const { note } = setup();
  const data = note.data as MealItem;
  expect(() => Note.create({ userId: note.userId, type: "meal", data: { ...data, generation: undefined } })).not.toThrow();
  expect(() => Note.create({ userId: note.userId, type: "meal", data: { ...data, generation: { status: "unknown" } } })).toThrow("generation status");
  expect(() => Note.create({ userId: note.userId, type: "meal", data: { ...data, generation: { status: "completed" } } })).toThrow("recipe");
});
