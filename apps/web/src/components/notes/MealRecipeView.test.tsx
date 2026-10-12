import { render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import type { MealRecipe } from "@/lib/api/contracts";
import { MealRecipeView } from "./MealRecipeView";

const recipe: MealRecipe = {
  source: "model",
  servings: 2,
  prepTimeMinutes: 30,
  ingredients: [
    { name: "Macarrão", quantity: "300 g" },
    { name: "Sal", quantity: "a gosto" },
  ],
  steps: ["Cozinhe o macarrão em água com sal.", "Escorra e sirva com o molho."],
};

test("shows the ingredients and the numbered preparation steps", () => {
  render(<MealRecipeView recipe={recipe} />);

  const ingredients = within(screen.getByRole("heading", { name: "Ingredientes" }).parentElement as HTMLElement);
  expect(ingredients.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
    "Macarrão300 g",
    "Sala gosto",
  ]);

  const steps = within(screen.getByRole("heading", { name: "Modo de preparo" }).parentElement as HTMLElement);
  expect(steps.getAllByRole("listitem").map((item) => item.textContent)).toEqual(recipe.steps);
  expect(screen.getByText("2 porções · Preparo em 30 min")).toBeInTheDocument();
});

test("flags a model-suggested recipe but not one the user described", () => {
  const { rerender } = render(<MealRecipeView recipe={recipe} />);
  expect(screen.getByText("Sugerida")).toBeInTheDocument();

  rerender(<MealRecipeView recipe={{ ...recipe, source: "user" }} />);
  expect(screen.queryByText("Sugerida")).not.toBeInTheDocument();
});

test("omits the ingredients section when the recipe has none", () => {
  render(<MealRecipeView recipe={{ ...recipe, ingredients: [] }} />);

  expect(screen.queryByRole("heading", { name: "Ingredientes" })).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Modo de preparo" })).toBeInTheDocument();
});
