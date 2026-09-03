import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { EventDetailDto, EventItemDto, UpdateEventItemInput } from "@repo/entities/contracts";
import { MealEditForm } from "./MealEditForm";

vi.mock("firebase/auth", () => ({
  getAuth: () => ({ currentUser: { getIdToken: async () => "test-token" } }),
}));
vi.mock("@/lib/firebase/client-app", () => ({ getClientApp: () => ({}) }));

const mealItem: Extract<EventItemDto, { type: "meal" }> = {
  id: "meal-item",
  position: 0,
  type: "meal",
  schemaVersion: 1,
  isPrimary: true,
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
};

/** Um treino que veio antes da refeicao no mesmo evento — e nao e o principal. */
const trainingItem: Extract<EventItemDto, { type: "training" }> = {
  id: "training-item",
  position: 1,
  type: "training",
  schemaVersion: 1,
  isPrimary: false,
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
};

const event: EventDetailDto = {
  id: "event-1",
  name: "Almoço",
  description: "",
  startedAt: "2026-08-19T15:00:00.000Z",
  finishedAt: "2026-08-19T15:30:00.000Z",
  tags: [],
  missed: false,
  priority: "normal",
  interruptions: [],
  revision: 7,
  primaryItemId: "meal-item",
  items: [trainingItem, mealItem],
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
      item={mealItem}
      onCancel={() => {}}
      onClose={() => {}}
      onUpdated={() => {}}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
}

function sentBody(): { expectedRevision: number; items: UpdateEventItemInput[] } {
  const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
  return JSON.parse(init.body as string) as {
    expectedRevision: number;
    items: UpdateEventItemInput[];
  };
}

test("sends the revision it read, so a stale tab loses instead of overwriting", async () => {
  save();

  await waitFor(() => expect(fetch).toHaveBeenCalled());
  expect(sentBody().expectedRevision).toBe(7);
});

test("sends every item, and only the edited one is rewritten", async () => {
  save();

  await waitFor(() => expect(fetch).toHaveBeenCalled());
  const { items } = sentBody();

  // O PATCH substitui a lista inteira: o treino que ninguem tocou precisa
  // atravessar igual, com o mesmo id, ou o merge o apagaria.
  expect(items.map((item) => item.id)).toEqual(["training-item", "meal-item"]);
  expect(items[0]).toMatchObject({ type: "training", isPrimary: false, data: trainingItem.data });
  expect(items[1]).toMatchObject({ type: "meal", isPrimary: true, schemaVersion: 1 });
});

test("carries the food data the form does not show", async () => {
  save();

  await waitFor(() => expect(fetch).toHaveBeenCalled());
  const mealData = sentBody().items[1]?.data as (typeof mealItem)["data"];

  expect(mealData.name).toBe("Almoço");
  expect(mealData.foodItems[0]?.micronutrients).toEqual({ ironMilligrams: 2.1 });
});

test("rewrites the food item the user edited", async () => {
  render(
    <MealEditForm
      event={event}
      item={mealItem}
      onCancel={() => {}}
      onClose={() => {}}
      onUpdated={() => {}}
    />,
  );
  fireEvent.change(screen.getByDisplayValue("130"), { target: { value: "145.5" } });
  fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

  await waitFor(() => expect(fetch).toHaveBeenCalled());
  const mealData = sentBody().items[1]?.data as (typeof mealItem)["data"];

  expect(mealData.foodItems[0]?.caloriesKcal).toBe(145.5);
  expect(mealData.foodItems[0]?.id).toBe("food-1");
});
