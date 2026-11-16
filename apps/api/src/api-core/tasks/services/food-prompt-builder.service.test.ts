import { describe, expect, test } from "vitest";
import { FoodPromptBuilderService } from "./food-prompt-builder.service";

describe("FoodPromptBuilderService", () => {
  test("embute o texto do usuario no prompt", () => {
    const prompt = new FoodPromptBuilderService().build("dois ovos mexidos");
    expect(prompt).toContain("dois ovos mexidos");
    expect(prompt).toContain("items");
  });

  test("pede receita com modo de preparo e nao pede micronutrientes", () => {
    const prompt = new FoodPromptBuilderService().build("macarrao");
    expect(prompt).toContain("recipe");
    expect(prompt).toContain("steps");
    expect(prompt).not.toMatch(/mainMicronutrients|otherData/);
  });
});
