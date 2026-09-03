import React from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { EventDetailDto, EventItemDto } from "@repo/entities/contracts";
import { EventDetailsModal } from "./EventDetailsModal";

vi.mock("firebase/auth", () => ({
  getAuth: () => ({ currentUser: { getIdToken: async () => "test-token" } }),
}));
vi.mock("@/lib/firebase/client-app", () => ({ getClientApp: () => ({}) }));

const routineItem: EventItemDto = {
  id: "routine-item",
  position: 0,
  type: "routine",
  schemaVersion: 1,
  isPrimary: false,
  data: {},
};

const sleepItem: EventItemDto = {
  id: "sleep-item",
  position: 1,
  type: "sleep",
  schemaVersion: 1,
  isPrimary: false,
  data: { trackedSleepTime: 480, score: 83 },
};

const trainingItem: EventItemDto = {
  id: "training-item",
  position: 2,
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

const mealItem: EventItemDto = {
  id: "meal-item",
  position: 3,
  type: "meal",
  schemaVersion: 1,
  isPrimary: true,
  data: {
    name: "Almoço",
    description: "Arroz",
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
        micronutrients: {},
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

function anEvent(overrides: Partial<EventDetailDto> = {}): EventDetailDto {
  return {
    id: "event-1",
    name: "Dia cheio",
    description: "",
    startedAt: "2026-08-19T12:00:00.000Z",
    finishedAt: "2026-08-19T13:00:00.000Z",
    tags: [],
    missed: false,
    priority: "normal",
    interruptions: [],
    revision: 1,
    primaryItemId: "meal-item",
    items: [routineItem, sleepItem, trainingItem, mealItem],
    ...overrides,
  };
}

function open(event: EventDetailDto) {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(event)));
  return render(
    <EventDetailsModal
      eventId={event.id}
      eventName={event.name}
      onClose={() => {}}
      onEdit={() => {}}
      onDelete={() => {}}
    />,
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("names the event after the item pointed by primaryItemId, not the first of the list", async () => {
  // A ordem dos itens e a que o usuario montou; ser o principal e outra coisa.
  // Ler pela posicao mostraria "Rotina" num evento que e uma refeicao.
  open(anEvent());

  expect(await screen.findByText("Refeição")).toBeInTheDocument();
  expect(screen.queryByText("Rotina")).not.toBeInTheDocument();
});

test("renders the payload of the four known item types", async () => {
  open(anEvent());

  expect(await screen.findByText(/Tempo monitorado: 480 min/)).toBeInTheDocument();
  expect(screen.getByText(/Pontuação: 83/)).toBeInTheDocument();
  expect(screen.getByText("Corrida")).toBeInTheDocument();
  expect(screen.getByText(/30 min · 300 kcal/)).toBeInTheDocument();
  expect(screen.getByText(/Arroz/)).toBeInTheDocument();
  expect(screen.getByText("130 kcal")).toBeInTheDocument();
  // Rotina nao tem payload: nao ha secao para ela.
  expect(screen.queryByText("Rotina", { selector: "h4" })).not.toBeInTheDocument();
});

test("a type this frontend does not know yet does not break the modal", async () => {
  const unknownItem = {
    id: "unknown-item",
    position: 0,
    type: "meditation",
    schemaVersion: 1,
    isPrimary: true,
    data: { minutes: 20 },
  } as unknown as EventItemDto;
  open(anEvent({ primaryItemId: "unknown-item", items: [unknownItem] }));

  expect(await screen.findByText("Evento")).toBeInTheDocument();
  expect(screen.getByRole("dialog", { name: "Dia cheio" })).toBeInTheDocument();
});

test("asks the backend with the token of the signed in user", async () => {
  open(anEvent());

  await screen.findByText("Refeição");
  expect(fetch).toHaveBeenCalledWith(
    "/api/events/event-1",
    expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
    }),
  );
});
