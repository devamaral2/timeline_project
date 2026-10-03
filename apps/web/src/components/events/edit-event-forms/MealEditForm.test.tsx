import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { EventDetailDto, NoteDto, UpdateEventNoteInput } from "@/lib/api/contracts";
import { noteOf } from "../note-fixtures";
import { MealEditForm } from "./MealEditForm";


const mealNote = noteOf({
  id: "meal-note",
  type: "meal",
  data: {
    name: "Almoço",
    description: "Arroz e feijão",
    foodItems: [
      {
        id: "food-1",
        name: "Arroz",
        portion: "100 g",
        approximateWeightGrams: 100,
        caloriesKcal: 130,
        macronutrients: {
          carbohydratesGrams: 28,
          proteinsGrams: 2.7,
          totalFatGrams: 0.3,
          fiberGrams: 0.4,
        },
        micronutrients: { ironMilligrams: 2.1 },
      },
    ],
    totals: {
      totalCaloriesKcal: 130,
      totalProteinGrams: 2.7,
      totalCarbohydrateGrams: 28,
      totalFatGrams: 0.3,
      totalFiberGrams: 0.4,
    },
  },
}) as Extract<NoteDto, { type: "meal" }>;

/** Um treino que veio antes da refeicao no mesmo evento — e nao e o do tipo do evento. */
const trainingNote = noteOf({
  id: "training-note",
  type: "training",
  data: {
    caloriesBurned: 300,
    workouts: [
      {
        id: "w-1",
        workoutCode: "running",
        workoutName: "Corrida",
        calories: 300,
        duration: 30,
        pace: 5,
        distance: 5,
      },
    ],
  },
});

const event: EventDetailDto = {
  id: "event-1",
  name: "Almoço",
  description: "",
  startedAt: "2026-08-19T15:00:00.000Z",
  finishedAt: "2026-08-19T15:30:00.000Z",
  tags: [],
  missed: false,
  priority: "normal",
  notifyOffsetsMinutes: [],
  interruptions: [],
  revision: 7,
  kind: "meal",
  notes: [trainingNote, mealNote],
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function save(): void {
  render(
    <MealEditForm
      event={event}
      note={mealNote}
      onCancel={() => {}}
      onClose={() => {}}
      onUpdated={() => {}}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
}

function sentBody(): { expectedRevision: number; notes: UpdateEventNoteInput[] } {
  const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
  return JSON.parse(init.body as string) as {
    expectedRevision: number;
    notes: UpdateEventNoteInput[];
  };
}

test("sends the revision it read, so a stale tab loses instead of overwriting", async () => {
  save();

  await waitFor(() => expect(fetch).toHaveBeenCalled());
  expect(sentBody().expectedRevision).toBe(7);
});

test("sends every note, and only the edited one is rewritten", async () => {
  save();

  await waitFor(() => expect(fetch).toHaveBeenCalled());
  const { notes } = sentBody();

  // O PATCH substitui a lista inteira: o treino que ninguem tocou precisa
  // atravessar so com o id — fica na lista sem ser reescrito —, ou sairia do evento.
  expect(notes.map((note) => note.id)).toEqual(["training-note", "meal-note"]);
  expect(notes[0]).toEqual({ id: "training-note" });
  expect(notes[1]).toMatchObject({ type: "meal", schemaVersion: 1 });
});

test("a meal event without a meal note creates it on save, after the notes it already has", async () => {
  const bare: EventDetailDto = { ...event, notes: [trainingNote] };
  render(
    <MealEditForm event={bare} onCancel={() => {}} onClose={() => {}} onUpdated={() => {}} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

  await waitFor(() => expect(fetch).toHaveBeenCalled());
  const { notes } = sentBody();

  expect(notes).toHaveLength(2);
  expect(notes[0]).toEqual({ id: "training-note" });
  // Uma note nova nao leva id: nasce no backend.
  expect(notes[1]).not.toHaveProperty("id");
  expect(notes[1]).toMatchObject({ type: "meal", data: { name: "Almoço", foodItems: [] } });
});

test("carries the food data the form does not show", async () => {
  save();

  await waitFor(() => expect(fetch).toHaveBeenCalled());
  const mealData = sentBody().notes[1]?.data as (typeof mealNote)["data"];

  expect(mealData.name).toBe("Almoço");
  expect(mealData.foodItems[0]?.micronutrients).toEqual({ ironMilligrams: 2.1 });
});

test("rewrites the food item the user edited", async () => {
  render(
    <MealEditForm
      event={event}
      note={mealNote}
      onCancel={() => {}}
      onClose={() => {}}
      onUpdated={() => {}}
    />,
  );
  fireEvent.change(screen.getByDisplayValue("130"), { target: { value: "145.5" } });
  fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

  await waitFor(() => expect(fetch).toHaveBeenCalled());
  const mealData = sentBody().notes[1]?.data as (typeof mealNote)["data"];

  expect(mealData.foodItems[0]?.caloriesKcal).toBe(145.5);
  expect(mealData.foodItems[0]?.id).toBe("food-1");
});
