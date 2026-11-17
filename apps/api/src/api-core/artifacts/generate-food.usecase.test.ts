import { expect, test, vi } from "vitest";
import { Artifact, calculateFoodTotals, type FoodData } from "../../domain";
import type { FoodGenerationPayload, FoodGenerationRepository } from "../../domain/ports";
import { GenerateFoodUseCase } from "./generate-food.usecase";

function setup() {
  const data: FoodData = { description: "banana", items: [], totals: calculateFoodTotals([]), generation: { status: "pending" } };
  const artifact = Artifact.create({ userId: "user-1", type: "food", name: "Almoço", data });
  const payload: FoodGenerationPayload = {
    artifactId: artifact.id, userId: "user-1", expectedRevision: artifact.revision, description: data.description, name: artifact.name,
  };
  const repository: FoodGenerationRepository = {
    findById: vi.fn().mockResolvedValue(artifact),
    finishFoodGeneration: vi.fn().mockResolvedValue(true),
  };
  const response = {
    items: [{
      food: "Banana", portion: "1 unidade", approximateWeightGrams: 100, caloriesKcal: 89,
      macronutrients: { carbohydratesGrams: 22.8, proteinsGrams: 1.1, totalFatGrams: 0.3, fiberGrams: 2.6 },
    }],
    recipe: { source: "model" as const, ingredients: [{ name: "Banana", quantity: "1 unidade" }], steps: ["Descasque e sirva."] },
    modelProvider: "stub", modelName: "stub",
  };
  const gateway = { parseFood: vi.fn().mockResolvedValue(response) };
  return { artifact, payload, repository, gateway, response, useCase: new GenerateFoodUseCase(repository, gateway) };
}

test("gera so a partir da descricao guardada no job, com totais calculados pelo servidor", async () => {
  const { useCase, payload, gateway, repository } = setup();
  await expect(useCase.execute(payload)).resolves.toBe("completed");
  expect(gateway.parseFood).toHaveBeenCalledTimes(1);
  expect(gateway.parseFood).toHaveBeenCalledWith({ text: "banana" });
  expect(repository.finishFoodGeneration).toHaveBeenCalledWith(payload, expect.objectContaining({
    description: "banana", generation: { status: "completed" }, nutritionSource: "model-estimate",
    totals: { totalCaloriesKcal: 89, totalProteinGrams: 1.1, totalCarbohydrateGrams: 22.8, totalFatGrams: 0.3, totalFiberGrams: 2.6 },
    recipe: expect.objectContaining({ source: "model" }),
    items: [expect.objectContaining({ name: "Banana", portion: "1 unidade" })],
  }), "completed");
});

test.each(["deleted", "foreign", "revision", "input", "renamed", "completed"] as const)("pula o alimento (%s) antes de chamar o provedor", async (scenario) => {
  const { useCase, payload, artifact, repository, gateway } = setup();
  const replacement = scenario === "deleted" ? null : Artifact.rehydrate({
    id: artifact.id, type: "food", schemaVersion: 1, createdAt: artifact.createdAt, updatedAt: artifact.updatedAt,
    userId: scenario === "foreign" ? "other-user" : "user-1",
    name: scenario === "renamed" ? "Jantar" : artifact.name,
    revision: scenario === "revision" ? 2 : 1,
    data: {
      ...(artifact.data as FoodData),
      ...(scenario === "input" ? { description: "different description" } : {}),
      ...(scenario === "completed" ? { generation: undefined } : {}),
    },
  });
  vi.mocked(repository.findById).mockResolvedValue(replacement);
  await expect(useCase.execute(payload)).resolves.toBe("skipped");
  expect(gateway.parseFood).not.toHaveBeenCalled();
  expect(repository.finishFoodGeneration).toHaveBeenCalledWith(payload, null, "skipped");
});

test("uma edicao ou exclusao enquanto o provedor responde pula a escrita, pelo compare-and-set do repositorio", async () => {
  const { useCase, payload, repository } = setup();
  vi.mocked(repository.finishFoodGeneration).mockResolvedValue(false);
  await expect(useCase.execute(payload)).resolves.toBe("skipped");
});

test.each(["recipe", "nutrition"] as const)("recusa %s mal formado antes de qualquer escrita", async (invalid) => {
  const { useCase, payload, response, gateway, repository } = setup();
  gateway.parseFood.mockResolvedValue(invalid === "recipe"
    ? { ...response, recipe: undefined }
    : { ...response, items: [{ ...response.items[0], caloriesKcal: -1 }] });
  await expect(useCase.execute(payload)).rejects.toThrow();
  expect(repository.finishFoodGeneration).not.toHaveBeenCalled();
});

test("falha do provedor sobe para a fila tentar de novo; a falha definitiva grava o estado de falha", async () => {
  const { useCase, payload, gateway, repository } = setup();
  gateway.parseFood.mockRejectedValue(new Error("unavailable"));
  await expect(useCase.execute(payload)).rejects.toThrow("unavailable");
  expect(repository.finishFoodGeneration).not.toHaveBeenCalled();
  await expect(useCase.fail(payload)).resolves.toBe("failed");
  expect(repository.finishFoodGeneration).toHaveBeenCalledWith(payload, expect.objectContaining({
    generation: { status: "failed" }, items: [], description: payload.description,
  }), "failed");
});

test("o alimento a espera dos nutrientes nao aceita edicao manual", () => {
  const { artifact } = setup();
  expect(() => artifact.revise({ name: "Novo nome" })).toThrow("being calculated");
});
