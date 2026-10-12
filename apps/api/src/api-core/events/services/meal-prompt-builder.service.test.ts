import { describe, expect, test } from "vitest";
import { MealPromptBuilderService } from "./meal-prompt-builder.service";

describe("MealPromptBuilderService", () => {
  test("embute o texto do usuario no prompt", () => {
    const prompt = new MealPromptBuilderService().build("dois ovos mexidos");
    expect(prompt).toContain("dois ovos mexidos");
    expect(prompt).toContain("items");
  });

  test("pede receita com modo de preparo e nao pede micronutrientes", () => {
    const prompt = new MealPromptBuilderService().build("macarrao");
    expect(prompt).toContain("recipe");
    expect(prompt).toContain("steps");
    expect(prompt).not.toMatch(/mainMicronutrients|otherData/);
  });
});
