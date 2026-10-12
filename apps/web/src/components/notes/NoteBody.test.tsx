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
