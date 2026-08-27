import { expect, test } from "vitest";
import { FoodPromptBuilderService } from "./food-prompt-builder.service";

test("includes the strict english-key JSON contract in the prompt", () => {
  const prompt = new FoodPromptBuilderService().build(
    "1 banana. 2 colheres de iogurte natural e 5 morangos",
  );

  expect(prompt).toContain('"food"');
  expect(prompt).toContain('"approximateWeightGrams"');
  expect(prompt).toContain("As chaves do JSON devem estar em inglês");
});
