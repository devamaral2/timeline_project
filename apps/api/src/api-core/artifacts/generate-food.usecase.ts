import { calculateFoodTotals, parseFoodData, type FoodData } from "../../domain";
import type { FoodGenerationOutcome, FoodGenerationPayload, FoodGenerationRepository } from "../../domain/ports";
import type { FoodParsingGateway } from "../events/gateways/food-parsing.gateway";
import { FoodTotalsService } from "../events/services/food-totals.service";

/**
 * Calcula os nutrientes de um alimento que nasceu pendente (o pedido de construcao, ADR 0013). O alimento so e
 * lido para conferir dono e se ainda espera a geracao: o provedor recebe exclusivamente a descricao que o usuario
 * escreveu, guardada no job.
 */
export class GenerateFoodUseCase {
  constructor(
    private readonly foods: FoodGenerationRepository,
    private readonly gateway: FoodParsingGateway,
    private readonly totals: FoodTotalsService = new FoodTotalsService(),
  ) {}

  async execute(payload: FoodGenerationPayload): Promise<FoodGenerationOutcome> {
    const artifact = await this.foods.findById(payload.artifactId);
    const data = artifact?.data as FoodData | undefined;
    if (!artifact || artifact.userId !== payload.userId || artifact.type !== "food" ||
        artifact.revision !== payload.expectedRevision || data?.generation?.status !== "pending" ||
        data.description !== payload.description || artifact.name !== payload.name) {
      await this.foods.finishFoodGeneration(payload, null, "skipped");
      return "skipped";
    }

    const parsed = await this.gateway.parseFood({ text: payload.description });
    if (!parsed.recipe) throw new Error("Food generation requires a recipe");
    const items = this.totals.toFoodItems(parsed.items);
    const generated = parseFoodData({
      description: payload.description,
      ...(data.quantity ? { quantity: data.quantity } : {}),
      items,
      totals: this.totals.calculate(items),
      recipe: parsed.recipe,
      nutritionSource: "model-estimate",
      generation: { status: "completed" },
    }, 1);
    const applied = await this.foods.finishFoodGeneration(payload, generated, "completed");
    return applied ? "completed" : "skipped";
  }

  /** So na falha definitiva; nem o erro do provedor nem o texto do usuario vao para o erro do job. */
  async fail(payload: FoodGenerationPayload): Promise<FoodGenerationOutcome> {
    const failed = parseFoodData({
      description: payload.description,
      items: [],
      totals: calculateFoodTotals([]),
      generation: { status: "failed" },
    }, 1);
    const applied = await this.foods.finishFoodGeneration(payload, failed, "failed");
    return applied ? "failed" : "skipped";
  }
}
