import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { EventDetailDto, NoteDto } from "@/lib/api/contracts";
import { EventDetailsModal } from "./EventDetailsModal";
import { noteOf } from "./note-fixtures";


const textNote: NoteDto = noteOf({
  id: "text-note",
  type: "text",
  name: "Lembrete",
  data: { body: "Levar a garrafa" },
});

const sleepNote: NoteDto = noteOf({ id: "sleep-note", type: "sleep", data: { trackedSleepTime: 480, score: 83 } });

const trainingNote: NoteDto = noteOf({
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

const mealNote: NoteDto = noteOf({
  id: "meal-note",
  type: "meal",
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
});

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
    notifyOffsetsMinutes: [],
    interruptions: [],
    revision: 1,
    kind: "meal",
    notes: [textNote, sleepNote, trainingNote, mealNote],
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

test("names the event after its kind, not after the first note of the list", async () => {
  // A ordem das notes e a que o usuario montou; a natureza do evento e o `kind`.
  // Ler pela posicao mostraria o texto de uma nota num evento que e uma refeicao.
  open(anEvent());

  expect(await screen.findByText("Refeição")).toBeInTheDocument();
  expect(screen.queryByText("Rotina")).not.toBeInTheDocument();
});

test("an event needs no note: the kind alone names it", async () => {
  open(anEvent({ kind: "sleep", notes: [] }));

  expect(await screen.findByText("Sono", { selector: "span" })).toBeInTheDocument();
});

test("renders the payload of the four known note types", async () => {
  open(anEvent());

  expect(await screen.findByText(/Tempo monitorado: 480 min/)).toBeInTheDocument();
  expect(screen.getByText(/Pontuação: 83/)).toBeInTheDocument();
  expect(screen.getByText("Corrida")).toBeInTheDocument();
  expect(screen.getByText(/30 min · 300 kcal/)).toBeInTheDocument();
  expect(screen.getByText(/Arroz/)).toBeInTheDocument();
  expect(screen.getByText("130 kcal")).toBeInTheDocument();
  // A nota de texto aparece com o titulo dela e o corpo.
  expect(screen.getByText("Lembrete")).toBeInTheDocument();
  expect(screen.getByText("Levar a garrafa")).toBeInTheDocument();
});

test("a type this frontend does not know yet does not break the modal", async () => {
  const unknownNote = noteOf({ id: "unknown-note", type: "meditation", data: { minutes: 20 } });
  open(anEvent({ kind: "meditation" as never, notes: [unknownNote] }));

  expect(await screen.findByText("Evento")).toBeInTheDocument();
  expect(screen.getByRole("dialog", { name: "Dia cheio" })).toBeInTheDocument();
});

test("asks the backend with the session of the signed in user", async () => {
  open(anEvent());

  await screen.findByText("Refeição");
  expect(fetch).toHaveBeenCalledWith(
    "/api/events/event-1",
    expect.objectContaining({
      credentials: "same-origin",
    }),
  );
});
