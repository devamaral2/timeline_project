import { describe, expect, test } from "vitest";
import { NoteValidationError } from "../errors/note.errors";
import { Note } from "./note.entity";

describe("Note aggregate", () => {
  test("creates with a 26-char id, revision 1 and the text type by default", () => {
    const note = Note.create({ userId: "user-1", data: { body: "Comprar pão" } });

    expect(note.id).toHaveLength(26);
    expect(note.revision).toBe(1);
    expect(note.type).toBe("text");
    expect(note.schemaVersion).toBe(1);
    expect(note.name).toBe("Comprar pão");
  });

  test("derives a name from the type when none is given", () => {
    expect(Note.create({ userId: "u", type: "sleep", data: { trackedSleepTime: 400, score: 80 } }).name).toBe(
      "Sono",
    );
    expect(Note.create({ userId: "u", type: "training", data: { workouts: [], caloriesBurned: 0 } }).name).toBe(
      "Treino",
    );
  });

  test("an explicit name wins over the derived one", () => {
    expect(Note.create({ userId: "u", name: "Lista", data: { body: "a" } }).name).toBe("Lista");
  });

  test("rejects a blank text body and an unknown type", () => {
    expect(() => Note.create({ userId: "user-1", data: { body: "   " } })).toThrow(NoteValidationError);
    expect(() => Note.create({ userId: "user-1", type: "poem", data: {} })).toThrow(NoteValidationError);
  });

  test("freezes the data so it cannot be mutated behind the entity's back", () => {
    const note = Note.create({ userId: "u", data: { body: "a" } });

    expect(Object.isFrozen(note.data)).toBe(true);
  });

  test("revise bumps the revision and keeps the identity", () => {
    const note = Note.create({ userId: "user-1", data: { body: "a" } });

    const revised = note.revise({ data: { body: "b" }, tags: ["x"] });

    expect(revised.data).toEqual({ body: "b" });
    expect(revised.tags).toEqual(["x"]);
    expect(revised.revision).toBe(2);
    expect(revised.id).toBe(note.id);
    expect(revised.createdAt).toEqual(note.createdAt);
  });

  test("changing the type requires new data", () => {
    const note = Note.create({ userId: "user-1", data: { body: "a" } });

    expect(() => note.revise({ type: "sleep" })).toThrow(NoteValidationError);
    expect(note.revise({ type: "sleep", data: { trackedSleepTime: 1, score: 1 } }).type).toBe("sleep");
  });

  test("manual edits cannot forge meal job states and keep existing estimate provenance", () => {
    const data = { name: "Almoço", description: "arroz", foodItems: [],
      totals: { totalCaloriesKcal: 0, totalProteinGrams: 0, totalCarbohydrateGrams: 0, totalFatGrams: 0, totalFiberGrams: 0 } };
    const manual = Note.create({ userId: "u", type: "meal", data });
    expect(() => manual.revise({ data: { ...data, generation: { status: "pending" } } })).toThrow(NoteValidationError);
    const generated = Note.create({ userId: "u", type: "meal", data: {
      ...data, generation: { status: "completed" }, nutritionSource: "model-estimate",
      recipe: { source: "model", ingredients: [], steps: ["Cozinhe o arroz."] },
    } });
    expect(generated.revise({ data: { ...generated.data as object, description: "arroz editado",
      generation: undefined, nutritionSource: undefined } }).data).toMatchObject({
      generation: { status: "completed" }, nutritionSource: "model-estimate",
    });
  });
});
