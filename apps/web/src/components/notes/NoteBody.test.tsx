import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import type { MealItem, NoteDto } from "@/lib/api/contracts";
import { NoteBody } from "./NoteBody";

const meal: MealItem = {
  name: "Almoço",
  description: "Macarrão à bolonhesa",
  foodItems: [],
  totals: {
    totalCaloriesKcal: 520,
    totalProteinGrams: 24,
    totalCarbohydrateGrams: 70,
    totalFatGrams: 14,
    totalFiberGrams: 5,
  },
};

const noteOf = (data: MealItem): NoteDto => ({
  id: "n1",
  name: "Almoço",
  type: "meal",
  schemaVersion: 1,
  tags: [],
  revision: 1,
  createdAt: "2026-09-14T12:00:00-03:00",
  updatedAt: "2026-09-14T12:00:00-03:00",
  data,
  links: [],
});

test("a meal note shows its macros and the preparation steps", () => {
  render(
    <NoteBody
      note={noteOf({
        ...meal,
        recipe: {
          source: "user",
          ingredients: [{ name: "Macarrão", quantity: "300 g" }],
          steps: ["Cozinhe o macarrão.", "Misture o molho."],
        },
      })}
    />,
  );

  expect(screen.getByText("Informações nutricionais")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Modo de preparo" })).toBeInTheDocument();
  expect(screen.getByText("Misture o molho.")).toBeInTheDocument();
  expect(screen.queryByText("Sugerida")).not.toBeInTheDocument();
});

test("a meal note without a recipe shows no recipe section", () => {
  render(<NoteBody note={noteOf(meal)} />);

  expect(screen.getByText("Informações nutricionais")).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Modo de preparo" })).not.toBeInTheDocument();
});

test("pending meal generation shows status, never placeholder nutrition", () => {
  render(<NoteBody note={noteOf({ ...meal, generation: { status: "pending" } })} />);
  expect(screen.getByRole("status")).toHaveTextContent("Preparando informações nutricionais e receita");
  expect(screen.queryByText("Informações nutricionais")).not.toBeInTheDocument();
  expect(screen.queryByText("kcal")).not.toBeInTheDocument();
});

test("failed meal generation preserves description without asserting zero nutrition", () => {
  render(<NoteBody note={noteOf({ ...meal, generation: { status: "failed" } })} />);
  expect(screen.getByRole("alert")).toHaveTextContent("Seu registro foi preservado");
  expect(screen.getByText(meal.description)).toBeInTheDocument();
  expect(screen.queryByText("kcal")).not.toBeInTheDocument();
});

test("generated nutrition is explicitly an estimate and model recipe is suggested", () => {
  render(<NoteBody note={noteOf({ ...meal, generation: { status: "completed" }, nutritionSource: "model-estimate",
    recipe: { source: "model", ingredients: [], steps: ["Misture."] } })} />);
  expect(screen.getByText("Estimativa nutricional gerada por IA.")).toBeInTheDocument();
  expect(screen.getByText("Sugerida")).toBeInTheDocument();
});
