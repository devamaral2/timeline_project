import { describe, expect, test } from "vitest";
import { ArtifactValidationError } from "../errors/artifact.errors";
import { Artifact, deriveArtifactName, type ArtifactRehydrateProps } from "./artifact.entity";

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
const recipe = { source: "model", ingredients: [{ name: "Arroz", quantity: "100 g" }], steps: ["Cozinhar"] };
const foodData = { description: "arroz branco", items: [rice], totals: riceTotals };
const pendingFood = { description: "arroz e feijao", items: [], totals: zeroTotals, generation: { status: "pending" } };
const workoutData = { code: "running", category: "cardio", active: true };
const agentFileData = { path: "hermes/skills/agenda/SKILL.md", hash: "a".repeat(64), missing: false };

function text(body = "Lembrar de alongar"): Artifact {
  return Artifact.create({ userId: "user-1", data: { body } });
}

describe("Artifact.create", () => {
  test("is a free text with revision 1 when no type is given", () => {
    const artifact = text();

    expect(artifact.id).toMatch(/^[0-9A-Z]{26}$/);
    expect(artifact.type).toBe("text");
    expect(artifact.schemaVersion).toBe(1);
    expect(artifact.data).toEqual({ body: "Lembrar de alongar" });
    expect(artifact.userId).toBe("user-1");
    expect(artifact.isGlobal).toBe(false);
    expect(artifact.derived).toBe(false);
    expect(artifact.tags).toEqual([]);
    expect(artifact.revision).toBe(1);
    expect(artifact.updatedAt).toEqual(artifact.createdAt);
  });

  test("accepts every artifact type with the data of that type", () => {
    const of = (type: string, data: unknown) => Artifact.create({ userId: "user-1", type, data, name: "x" }).type;

    expect(of("text", { body: "nota" })).toBe("text");
    expect(of("food", foodData)).toBe("food");
    expect(of("sleep", { trackedSleepTime: 420, score: 80 })).toBe("sleep");
    expect(of("training", { workouts: [], caloriesBurned: 0 })).toBe("training");
    expect(of("workout", workoutData)).toBe("workout");
    expect(of("skill", agentFileData)).toBe("skill");
    expect(of("agent", { ...agentFileData, path: "hermes/agents/planner.md" })).toBe("agent");
    expect(of("router", { body: "rota" })).toBe("router");
  });

  test("rejects an unknown type and data that does not fit the type", () => {
    expect(() => Artifact.create({ userId: "user-1", type: "meal", data: {} })).toThrow("Unknown artifact type: meal");
    expect(() => Artifact.create({ userId: "user-1", type: "sleep", data: { body: "x" } })).toThrow(ArtifactValidationError);
    expect(() => Artifact.create({ userId: "user-1", data: { body: "   " } })).toThrow("Text artifact requires a body");
  });

  test("normalizes the tags", () => {
    expect(Artifact.create({ userId: "user-1", data: { body: "x" }, tags: [" Saude ", "saude", ""] }).tags).toEqual(["saude"]);
  });

  describe("global artifacts", () => {
    test("only foods and workouts may have no owner", () => {
      const food = Artifact.create({ type: "food", name: "Arroz", data: foodData });
      const workout = Artifact.create({ type: "workout", name: "Corrida", data: workoutData });

      expect(food.isGlobal).toBe(true);
      expect(food.userId).toBeUndefined();
      expect(workout.isGlobal).toBe(true);
    });

    test("every other type requires an owner", () => {
      const cases: [string, unknown][] = [
        ["text", { body: "x" }],
        ["sleep", { trackedSleepTime: 1, score: 1 }],
        ["training", { workouts: [], caloriesBurned: 0 }],
        ["skill", agentFileData],
        ["agent", agentFileData],
        ["router", { body: "x" }],
      ];
      for (const [type, data] of cases) {
        expect(() => Artifact.create({ type, data, name: "x" }), type).toThrow(
          "Only foods and workouts can be global artifacts",
        );
      }
    });
  });

  describe("name", () => {
    test("keeps the name that was given", () => {
      expect(Artifact.create({ userId: "user-1", name: "Ideias", data: { body: "primeira linha" } }).name).toBe("Ideias");
    });

    test("derives it from the first non-empty line of a text, up to 100 characters", () => {
      expect(text("\n  Primeira linha  \nsegunda").name).toBe("Primeira linha");
      expect(text("a".repeat(150)).name).toBe("a".repeat(100));
    });

    test("derives it from the description of a food, falling back to a generic one", () => {
      const named = Artifact.create({ userId: "user-1", type: "food", data: foodData });
      const unnamed = Artifact.create({ userId: "user-1", type: "food", data: { ...foodData, description: "" } });

      expect(named.name).toBe("arroz branco");
      expect(unnamed.name).toBe("Alimento");
    });

    test("uses the label of the type for sleep and training, and a generic one for the rest", () => {
      expect(Artifact.create({ userId: "user-1", type: "sleep", data: { trackedSleepTime: 1, score: 1 } }).name).toBe("Sono");
      expect(Artifact.create({ userId: "user-1", type: "training", data: { workouts: [], caloriesBurned: 0 } }).name).toBe("Treino");
      expect(Artifact.create({ type: "workout", data: workoutData }).name).toBe("Artefato");
    });

    test("rejects a blank name", () => {
      expect(() => Artifact.create({ userId: "user-1", name: "   ", data: { body: "x" } })).toThrow(
        "Artifact name cannot be empty",
      );
    });

    test("deriveArtifactName covers data that never reaches an artifact", () => {
      expect(deriveArtifactName("text", { body: "" })).toBe("Nota");
      expect(deriveArtifactName("text", null)).toBe("Nota");
      expect(deriveArtifactName("food", {})).toBe("Alimento");
      expect(deriveArtifactName("router", { body: "rota" })).toBe("Artefato");
    });
  });

  describe("data", () => {
    test("is deeply frozen", () => {
      const artifact = Artifact.create({ userId: "user-1", type: "food", data: foodData });
      const data = artifact.data as typeof foodData;

      expect(Object.isFrozen(data)).toBe(true);
      expect(Object.isFrozen(data.items)).toBe(true);
      expect(Object.isFrozen(data.items[0])).toBe(true);
      expect(Object.isFrozen(data.items[0]?.macronutrients)).toBe(true);
      expect(() => {
        data.totals.totalCaloriesKcal = 1;
      }).toThrow(TypeError);
    });

    test("is a copy: changing what was passed in does not change the artifact", () => {
      const input = { body: "original" };
      const artifact = Artifact.create({ userId: "user-1", data: input });

      input.body = "alterado";

      expect(artifact.data).toEqual({ body: "original" });
      expect(Object.isFrozen(input)).toBe(false);
    });

    test("keeps only what the type knows", () => {
      const artifact = Artifact.create({ userId: "user-1", data: { body: "x", extra: true } });

      expect(artifact.data).toEqual({ body: "x" });
    });
  });
});

describe("Artifact.rehydrate", () => {
  const row: ArtifactRehydrateProps = {
    id: "artifact-1",
    userId: "user-1",
    name: "Ideias",
    type: "text",
    schemaVersion: 1,
    data: { body: "x" },
    derived: true,
    revision: 4,
    createdAt: new Date("2020-08-01T10:00:00.000Z"),
    updatedAt: new Date("2020-08-02T10:00:00.000Z"),
  };

  test("returns the row as it was stored", () => {
    const artifact = Artifact.rehydrate(row);

    expect(artifact).toMatchObject({ id: "artifact-1", name: "Ideias", derived: true, revision: 4 });
    expect(artifact.createdAt).toEqual(row.createdAt);
    expect(artifact.updatedAt).toEqual(row.updatedAt);
  });

  test("rejects a revision that is not an integer >= 1", () => {
    expect(() => Artifact.rehydrate({ ...row, revision: 0 })).toThrow("Artifact revision must be an integer >= 1");
    expect(() => Artifact.rehydrate({ ...row, revision: 2.5 })).toThrow(ArtifactValidationError);
  });

  test("still validates the stored data", () => {
    expect(() => Artifact.rehydrate({ ...row, schemaVersion: 2 })).toThrow("Unsupported schema version");
    expect(() => Artifact.rehydrate({ ...row, userId: undefined })).toThrow(
      "Only foods and workouts can be global artifacts",
    );
  });
});

describe("Artifact.revise", () => {
  test("bumps the revision and keeps the identity, the creation date and what was not changed", () => {
    const artifact = Artifact.rehydrate({
      id: "artifact-1",
      userId: "user-1",
      name: "Ideias",
      type: "text",
      schemaVersion: 1,
      data: { body: "x" },
      tags: ["casa"],
      revision: 2,
      createdAt: new Date("2020-08-01T10:00:00.000Z"),
      updatedAt: new Date("2020-08-01T10:00:00.000Z"),
    });

    const revised = artifact.revise({ name: "Planos" });

    expect(revised.revision).toBe(3);
    expect(revised.id).toBe("artifact-1");
    expect(revised.name).toBe("Planos");
    expect(revised.data).toEqual({ body: "x" });
    expect(revised.tags).toEqual(["casa"]);
    expect(revised.createdAt).toEqual(artifact.createdAt);
    expect(revised.updatedAt.getTime()).toBeGreaterThan(artifact.updatedAt.getTime());
    expect(artifact.name).toBe("Ideias");
    expect(artifact.revision).toBe(2);
  });

  test("replaces the data and the tags", () => {
    const revised = text().revise({ data: { body: "novo corpo" }, tags: ["Casa"] });

    expect(revised.data).toEqual({ body: "novo corpo" });
    expect(revised.tags).toEqual(["casa"]);
    expect(Object.isFrozen(revised.data)).toBe(true);
  });

  test("keeps the name it already had when only the data changes", () => {
    const artifact = text("Titulo antigo");

    expect(artifact.revise({ data: { body: "Titulo novo" } }).name).toBe("Titulo antigo");
  });

  test("validates the new data against the type", () => {
    expect(() => text().revise({ data: { body: "" } })).toThrow("Text artifact requires a body");
  });

  test("changing the type requires the data of the new type", () => {
    const artifact = text();

    expect(() => artifact.revise({ type: "sleep" })).toThrow("Changing the artifact type requires new data");
    const sleep = artifact.revise({ type: "sleep", data: { trackedSleepTime: 420, score: 90 } });
    expect(sleep.type).toBe("sleep");
    expect(sleep.data).toEqual({ trackedSleepTime: 420, score: 90 });
    expect(sleep.schemaVersion).toBe(1);
  });

  test("repeating the same type is not a type change", () => {
    expect(text().revise({ type: "text", name: "Outro" }).name).toBe("Outro");
  });

  test("keeps a copy marked as derived", () => {
    const copy = Artifact.create({ userId: "user-1", type: "food", data: foodData, derived: true });

    expect(copy.revise({ name: "Arroz do almoco" }).derived).toBe(true);
  });

  test("a global artifact cannot be revised", () => {
    const global = Artifact.create({ type: "food", name: "Arroz", data: foodData });

    expect(() => global.revise({ name: "Outro" })).toThrow("A global artifact cannot be edited");
  });

  describe("food", () => {
    test("cannot be edited by hand while its nutrients are being calculated", () => {
      const pending = Artifact.create({ userId: "user-1", type: "food", name: "Almoco", data: pendingFood });

      expect(() => pending.revise({ name: "Outro" })).toThrow(
        "A food whose nutrients are being calculated cannot be manually edited",
      );
      expect(() => pending.revise({ data: foodData })).toThrow(ArtifactValidationError);
    });

    test("can be edited once the calculation failed or completed", () => {
      const failed = Artifact.create({
        userId: "user-1",
        type: "food",
        name: "Almoco",
        data: { ...pendingFood, generation: { status: "failed" } },
      });

      expect(failed.revise({ data: foodData }).data).toMatchObject({ description: "arroz branco" });
    });

    test("keeps what the server wrote when the user edits the content", () => {
      const generated = Artifact.create({
        userId: "user-1",
        type: "food",
        data: { ...foodData, recipe, generation: { status: "completed" }, nutritionSource: "model-estimate" },
      });

      const revised = generated.revise({ data: { ...foodData, description: "arroz integral", recipe } });

      expect(revised.data).toMatchObject({
        description: "arroz integral",
        generation: { status: "completed" },
        nutritionSource: "model-estimate",
      });
    });

    test("accepts the server-owned keys sent back unchanged, and rejects them changed or invented", () => {
      const generated = Artifact.create({
        userId: "user-1",
        type: "food",
        data: { ...foodData, recipe, generation: { status: "completed" }, nutritionSource: "model-estimate" },
      });
      const plain = Artifact.create({ userId: "user-1", type: "food", data: foodData });

      const echoed = generated.revise({
        data: { ...foodData, recipe, generation: { status: "completed" }, nutritionSource: "model-estimate" },
      });
      expect(echoed.revision).toBe(2);

      expect(() => generated.revise({ data: { ...foodData, recipe, generation: { status: "failed" } } })).toThrow(
        "Food generation metadata is server-owned",
      );
      expect(() => plain.revise({ data: { ...foodData, nutritionSource: "model-estimate" } })).toThrow(
        "Food generation metadata is server-owned",
      );
      expect(() => plain.revise({ data: { ...foodData, generation: { status: "pending" } } })).toThrow(
        "Food generation metadata is server-owned",
      );
    });

    test("an artifact that becomes a food cannot bring generation metadata with it", () => {
      const artifact = text();

      expect(() => artifact.revise({ type: "food", data: { ...pendingFood } })).toThrow(
        "Food generation metadata is server-owned",
      );
      expect(artifact.revise({ type: "food", data: foodData }).type).toBe("food");
    });
  });
});

describe("Artifact.withGeneratedData", () => {
  test("writes the calculated content over a pending food and bumps the revision", () => {
    const pending = Artifact.create({ userId: "user-1", type: "food", name: "Almoco", data: pendingFood });

    const generated = pending.withGeneratedData({
      ...foodData,
      recipe,
      generation: { status: "completed" },
      nutritionSource: "model-estimate",
    });

    expect(generated.id).toBe(pending.id);
    expect(generated.name).toBe("Almoco");
    expect(generated.revision).toBe(2);
    expect(generated.data).toMatchObject({
      items: [rice],
      totals: riceTotals,
      generation: { status: "completed" },
      nutritionSource: "model-estimate",
    });
  });

  test("records a failed generation", () => {
    const pending = Artifact.create({ userId: "user-1", type: "food", name: "Almoco", data: pendingFood });

    const failed = pending.withGeneratedData({ ...pendingFood, generation: { status: "failed" } });

    expect(failed.data).toMatchObject({ generation: { status: "failed" }, items: [] });
  });

  test("still validates what the generation produced", () => {
    const pending = Artifact.create({ userId: "user-1", type: "food", name: "Almoco", data: pendingFood });

    expect(() => pending.withGeneratedData({ ...foodData, generation: { status: "completed" } })).toThrow(
      "Completed food generation requires a recipe",
    );
  });
});

describe("Artifact.copyForEvent", () => {
  test("makes a derived food owned by the user, with the quantity eaten", () => {
    const original = Artifact.create({ userId: "user-1", type: "food", name: "Arroz", data: foodData, tags: ["base"] });

    const copy = original.copyForEvent("user-1", "  2 colheres ");

    expect(copy.id).not.toBe(original.id);
    expect(copy.userId).toBe("user-1");
    expect(copy.type).toBe("food");
    expect(copy.name).toBe("Arroz");
    expect(copy.derived).toBe(true);
    expect(copy.revision).toBe(1);
    expect(copy.data).toEqual({ ...foodData, quantity: "2 colheres" });
  });

  test("never touches the original", () => {
    const original = Artifact.create({ userId: "user-1", type: "food", name: "Arroz", data: foodData });

    original.copyForEvent("user-1", "1 prato");

    expect(original.derived).toBe(false);
    expect(original.revision).toBe(1);
    expect(original.data).toEqual(foodData);
  });

  test("leaves the quantity out when none was given", () => {
    const original = Artifact.create({ userId: "user-1", type: "food", name: "Arroz", data: foodData });

    expect(original.copyForEvent("user-1").data).toEqual(foodData);
    expect(original.copyForEvent("user-1", "   ").data).toEqual(foodData);
  });

  test("a global food becomes a copy owned by whoever ate it", () => {
    const global = Artifact.create({ type: "food", name: "Arroz", data: foodData });

    const copy = global.copyForEvent("user-2", "1 prato");

    expect(copy.isGlobal).toBe(false);
    expect(copy.userId).toBe("user-2");
    expect(global.isGlobal).toBe(true);
  });

  test("does not carry the generation state of the original", () => {
    const generated = Artifact.create({
      userId: "user-1",
      type: "food",
      data: { ...foodData, recipe, generation: { status: "completed" }, nutritionSource: "model-estimate" },
    });

    const copy = generated.copyForEvent("user-1");

    expect(copy.data).not.toHaveProperty("generation");
    expect(copy.data).toMatchObject({ recipe, nutritionSource: "model-estimate" });
  });

  test("only a food can be copied into an event", () => {
    expect(() => text().copyForEvent("user-1")).toThrow("Only a food can be copied into an event");
    expect(() => Artifact.create({ type: "workout", name: "Corrida", data: workoutData }).copyForEvent("user-1")).toThrow(
      ArtifactValidationError,
    );
  });
});
