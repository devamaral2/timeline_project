import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import type { FoodData, TrainingData } from "@repo/contracts";
import { MealNote, TrainingNote } from "./NoteBody";

const meal: FoodData = {
  description: "Macarrão à bolonhesa",
  items: [],
  totals: {
    totalCaloriesKcal: 520,
    totalProteinGrams: 24,
    totalCarbohydrateGrams: 70,
    totalFatGrams: 14,
    totalFiberGrams: 5,
  },
};

test("a meal note shows its macros and the preparation steps", () => {
  render(
    <MealNote
      data={{
        ...meal,
        recipe: {
          source: "user",
          ingredients: [{ name: "Macarrão", quantity: "300 g" }],
          steps: ["Cozinhe o macarrão.", "Misture o molho."],
        },
      }}
    />,
  );

  expect(screen.getByRole("region", { name: "Informações nutricionais" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Modo de preparo" })).toBeInTheDocument();
  expect(screen.getByText("Misture o molho.")).toBeInTheDocument();
  expect(screen.queryByText("Sugerida")).not.toBeInTheDocument();
});

test("a meal note without a recipe shows no recipe section", () => {
  render(<MealNote data={meal} />);

  expect(screen.getByRole("region", { name: "Informações nutricionais" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Modo de preparo" })).not.toBeInTheDocument();
});

test("pending meal generation shows status, never placeholder nutrition", () => {
  render(<MealNote data={{ ...meal, generation: { status: "pending" } }} />);
  expect(screen.getByRole("status")).toHaveTextContent("Preparando informações nutricionais e receita");
  expect(screen.queryByRole("region", { name: "Informações nutricionais" })).not.toBeInTheDocument();
  expect(screen.queryByText("kcal")).not.toBeInTheDocument();
});

test("failed meal generation preserves description without asserting zero nutrition", () => {
  render(<MealNote data={{ ...meal, generation: { status: "failed" } }} />);
  expect(screen.getByRole("alert")).toHaveTextContent("Seu registro foi preservado");
  expect(screen.getByText(meal.description)).toBeInTheDocument();
  expect(screen.queryByText("kcal")).not.toBeInTheDocument();
});

test("generated nutrition is explicitly an estimate and model recipe is suggested", () => {
  render(
    <MealNote
      data={{
        ...meal,
        generation: { status: "completed" },
        nutritionSource: "model-estimate",
        recipe: { source: "model", ingredients: [], steps: ["Misture."] },
      }}
    />,
  );
  expect(screen.getByText("Estimativa nutricional gerada por IA.")).toBeInTheDocument();
  expect(screen.getByText("Sugerida")).toBeInTheDocument();
});

test("a walking note shows the cardio summary with distance and pace", () => {
  const data: TrainingData = {
    workouts: [
      {
        id: "w-walking",
        workoutCode: "walking",
        workoutName: "Caminhada",
        calories: 100,
        duration: 120,
        pace: 5,
        distance: 24,
      },
    ],
    caloriesBurned: 100,
  };

  render(<TrainingNote data={data} />);

  expect(screen.getByText(/24 km/)).toBeInTheDocument();
  expect(screen.getByText(/5′00″\/km/)).toBeInTheDocument();
});
