import { describe, expect, test } from "vitest";
import { ArtifactValidationError } from "../../../domain";
import { InMemoryWorkoutCatalog } from "../../events/testing/in-memory-workout.catalog";
import { ArtifactBuilder } from "./artifact-builder.service";

const userId = "auth-user-1";
// 17/08/2026, 12:00 em Sao Paulo.
const noon = new Date("2026-08-17T15:00:00.000Z");
const zeroTotals = {
  totalCaloriesKcal: 0,
  totalProteinGrams: 0,
  totalCarbohydrateGrams: 0,
  totalFatGrams: 0,
  totalFiberGrams: 0,
};
const rice = {
  id: "item-1",
  name: "Arroz",
  portion: "100 g",
  approximateWeightGrams: 100,
  caloriesKcal: 130,
  macronutrients: { carbohydratesGrams: 28, proteinsGrams: 2.7, totalFatGrams: 0.3, fiberGrams: 0.4 },
};
const riceTotals = {
  totalCaloriesKcal: 130,
  totalProteinGrams: 2.7,
  totalCarbohydrateGrams: 28,
  totalFatGrams: 0.3,
  totalFiberGrams: 0.4,
};

const builder = new ArtifactBuilder(new InMemoryWorkoutCatalog());

describe("fromCreateInput", () => {
  test("without a type, builds a free text owned by the user", async () => {
    const artifact = await builder.fromCreateInput({ data: { body: "Comprar tinta\nazul" }, tags: ["Casa"] }, userId, noon);

    expect(artifact).toMatchObject({ type: "text", userId, name: "Comprar tinta", tags: ["casa"], derived: false, revision: 1 });
    expect(artifact.data).toEqual({ body: "Comprar tinta\nazul" });
  });

  test("keeps the name that was given", async () => {
    const artifact = await builder.fromCreateInput({ type: "text", name: "Compras", data: { body: "tinta" } }, userId, noon);

    expect(artifact.name).toBe("Compras");
  });

  test("a text without a body is refused", async () => {
    await expect(builder.fromCreateInput({ data: { body: " " } }, userId, noon)).rejects.toThrow(ArtifactValidationError);
  });

  describe("food", () => {
    test("is born pending, with the text as description and no nutrients yet", async () => {
      const artifact = await builder.fromCreateInput({ type: "food", data: { inputText: "  arroz e feijão " } }, userId, noon);

      expect(artifact.type).toBe("food");
      expect(artifact.data).toEqual({
        description: "arroz e feijão",
        items: [],
        totals: zeroTotals,
        generation: { status: "pending" },
      });
    });

    test("is named after the meal of the hour, unless a name was given", async () => {
      const lunch = await builder.fromCreateInput({ type: "food", data: { inputText: "arroz" } }, userId, noon);
      const breakfast = await builder.fromCreateInput(
        { type: "food", data: { inputText: "pão" } },
        userId,
        new Date("2026-08-17T11:00:00.000Z"),
      );
      const named = await builder.fromCreateInput({ type: "food", name: "Marmita", data: { inputText: "arroz" } }, userId, noon);

      expect(lunch.name).toBe("Almoço");
      expect(breakfast.name).toBe("Café da manhã");
      expect(named.name).toBe("Marmita");
    });

    test("refuses an empty description", async () => {
      await expect(builder.fromCreateInput({ type: "food", data: { inputText: "   " } }, userId, noon)).rejects.toThrow(
        "Food description cannot be empty",
      );
    });

    test("each pending food has its own totals object", async () => {
      const first = await builder.fromCreateInput({ type: "food", data: { inputText: "a" } }, userId, noon);
      const second = await builder.fromCreateInput({ type: "food", data: { inputText: "b" } }, userId, noon);

      expect((first.data as { totals: object }).totals).not.toBe((second.data as { totals: object }).totals);
    });
  });

  describe("sleep", () => {
    test("defaults the missing numbers to zero", async () => {
      const empty = await builder.fromCreateInput({ type: "sleep" }, userId, noon);
      const partial = await builder.fromCreateInput({ type: "sleep", data: { score: 80 } }, userId, noon);

      expect(empty).toMatchObject({ type: "sleep", name: "Sono" });
      expect(empty.data).toEqual({ trackedSleepTime: 0, score: 0 });
      expect(partial.data).toEqual({ trackedSleepTime: 0, score: 80 });
    });
  });

  describe("training", () => {
    test("without workouts, is an empty training", async () => {
      const artifact = await builder.fromCreateInput({ type: "training" }, userId, noon);

      expect(artifact).toMatchObject({ type: "training", name: "Treino" });
      expect(artifact.data).toEqual({ workouts: [], caloriesBurned: 0 });
    });

    test("names the workouts from the global exercises and sums the calories", async () => {
      const artifact = await builder.fromCreateInput(
        {
          type: "training",
          data: {
            workouts: [
              { id: "w1", workoutCode: "running", pace: 320, distance: 5, duration: 25, calories: 320 },
              { workoutCode: "weightlifting", duration: 40, calories: 180, sets: [{ exercise: "Supino", repetitions: 10, weight: 60 }] },
              { workoutCode: "free", duration: 10 },
            ],
          },
        },
        userId,
        noon,
      );

      const data = artifact.data as { workouts: Record<string, unknown>[]; caloriesBurned: number };
      expect(data.caloriesBurned).toBe(500);
      expect(data.workouts).toMatchObject([
        { id: "w1", workoutCode: "running", workoutName: "Corrida", calories: 320, duration: 25, pace: 320, distance: 5 },
        { workoutCode: "weightlifting", workoutName: "Musculação", calories: 180, sets: [{ exercise: "Supino", repetitions: 10, weight: 60 }] },
        { workoutCode: "free", workoutName: "Livre", calories: 0, duration: 10 },
      ]);
      expect(data.workouts[1]?.id).toMatch(/^[0-9A-Z]{26}$/);
      expect(data.workouts[1]).toMatchObject({ sets: [{ id: expect.stringMatching(/^[0-9A-Z]{26}$/) }] });
      expect(data.workouts[2]).not.toHaveProperty("pace");
    });

    test("refuses a workout that is not an active global exercise", async () => {
      const onlyRunning = new ArtifactBuilder(
        new InMemoryWorkoutCatalog([
          { code: "running", name: "Corrida", category: "cardio", active: true },
          { code: "free", name: "Livre", category: "free", active: false },
        ]),
      );
      const training = (workoutCode: "walking" | "free") =>
        onlyRunning.fromCreateInput(
          { type: "training", data: { workouts: [{ workoutCode, duration: 10, pace: 1, distance: 1 } as never] } },
          userId,
          noon,
        );

      await expect(training("walking")).rejects.toThrow("Unknown workout code: walking");
      await expect(training("free")).rejects.toThrow("Unknown workout code: free");
    });
  });
});

describe("resolveUpdateData", () => {
  test("a text or a sleep goes through as it came", async () => {
    expect(await builder.resolveUpdateData({ type: "text", data: { body: "nota" } })).toEqual({
      type: "text",
      data: { body: "nota" },
    });
    expect(await builder.resolveUpdateData({ type: "sleep", data: { trackedSleepTime: 400, score: 70 } })).toEqual({
      type: "sleep",
      data: { trackedSleepTime: 400, score: 70 },
    });
  });

  test("the totals of a food with items are recalculated from the items, whatever came", async () => {
    const resolved = await builder.resolveUpdateData({
      type: "food",
      data: { description: "arroz", items: [rice], totals: { ...zeroTotals, totalCaloriesKcal: 9999 } },
    });

    expect(resolved).toEqual({ type: "food", data: { description: "arroz", items: [rice], totals: riceTotals } });
  });

  test("the totals of a food without items are the ones that came", async () => {
    const own = { ...zeroTotals, totalCaloriesKcal: 89 };

    const resolved = await builder.resolveUpdateData({ type: "food", data: { description: "banana", items: [], totals: own } });

    expect(resolved.data).toEqual({ description: "banana", items: [], totals: own });
  });

  test("a food without the list of items is treated as having none", async () => {
    const resolved = await builder.resolveUpdateData({
      type: "food",
      data: { description: "banana", totals: zeroTotals } as never,
    });

    expect(resolved.data).toMatchObject({ items: [], totals: zeroTotals });
  });

  test("an edit cannot schedule the nutrient calculation", async () => {
    await expect(
      builder.resolveUpdateData({
        type: "food",
        data: { description: "arroz", items: [], totals: zeroTotals, generation: { status: "pending" } },
      }),
    ).rejects.toThrow("Only food creation can schedule the nutrient calculation");
  });

  test("the workout names and the calories burned of a training are recalculated", async () => {
    const resolved = await builder.resolveUpdateData({
      type: "training",
      data: {
        workouts: [
          { id: "w1", workoutCode: "running", workoutName: "Trote", calories: 300, duration: 30, pace: 5, distance: 5 },
          { id: "w2", workoutCode: "free", workoutName: "", calories: 100, duration: 10 },
        ],
        caloriesBurned: 1,
      },
    });

    expect(resolved).toEqual({
      type: "training",
      data: {
        workouts: [
          { id: "w1", workoutCode: "running", workoutName: "Corrida", calories: 300, duration: 30, pace: 5, distance: 5 },
          { id: "w2", workoutCode: "free", workoutName: "Livre", calories: 100, duration: 10 },
        ],
        caloriesBurned: 400,
      },
    });
  });

  test("a training with an unknown workout is refused", async () => {
    await expect(
      builder.resolveUpdateData({
        type: "training",
        data: {
          workouts: [{ id: "w1", workoutCode: "swimming" as never, workoutName: "Natação", calories: 1, duration: 1 } as never],
          caloriesBurned: 1,
        },
      }),
    ).rejects.toThrow("Unknown workout code: swimming");
  });
});

describe("fromUpdateInput", () => {
  test("builds a new artifact from complete data, with the derived values recalculated", async () => {
    const artifact = await builder.fromUpdateInput(
      {
        type: "food",
        name: "Arroz",
        tags: ["Base"],
        schemaVersion: 1,
        data: { description: "arroz branco", items: [rice], totals: zeroTotals },
      },
      userId,
    );

    expect(artifact).toMatchObject({ type: "food", name: "Arroz", tags: ["base"], userId, revision: 1, derived: false });
    expect(artifact.data).toEqual({ description: "arroz branco", items: [rice], totals: riceTotals });
  });

  test("derives the name when none was given", async () => {
    const artifact = await builder.fromUpdateInput({ type: "text", data: { body: "Ideias\nsoltas" } }, userId);

    expect(artifact.name).toBe("Ideias");
  });

  test("a new food cannot bring what only the server writes", async () => {
    const data = { description: "arroz", items: [], totals: zeroTotals };

    await expect(
      builder.fromUpdateInput({ type: "food", data: { ...data, nutritionSource: "model-estimate" } }, userId),
    ).rejects.toThrow("Food generation metadata is server-owned");
    await expect(
      builder.fromUpdateInput({ type: "food", data: { ...data, generation: { status: "failed" } } }, userId),
    ).rejects.toThrow("Food generation metadata is server-owned");
  });

  test("validates the data against the type", async () => {
    await expect(builder.fromUpdateInput({ type: "text", data: { body: "" } }, userId)).rejects.toThrow(
      "Text artifact requires a body",
    );
    await expect(builder.fromUpdateInput({ type: "text", schemaVersion: 2, data: { body: "x" } }, userId)).rejects.toThrow(
      "Unsupported schema version",
    );
  });
});
