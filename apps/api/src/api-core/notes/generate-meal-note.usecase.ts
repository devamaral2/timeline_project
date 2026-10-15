import { calculateMealTotals, parseMealItem, type MealItem } from "../../domain";
import type {
  MealNoteGenerationPayload,
  MealNoteGenerationRepository,
  MealNoteGenerationResult,
} from "../../domain/ports";
import type { MealParsingGateway } from "../events/gateways/meal-parsing.gateway";
import { MealTotalsService } from "../events/services/meal-totals.service";

/**
 * Reads a note only to establish ownership and liveness. The provider receives
 * exclusively the immutable user description in the job payload.
 */
export class GenerateMealNoteUseCase {
  constructor(
    private readonly notes: MealNoteGenerationRepository,
    private readonly gateway: MealParsingGateway,
    private readonly totals: MealTotalsService = new MealTotalsService(),
  ) {}

  async execute(payload: MealNoteGenerationPayload): Promise<MealNoteGenerationResult> {
    const note = await this.notes.findById(payload.noteId);
    const data = note?.data as MealItem | undefined;
    if (!note || note.userId !== payload.userId || note.type !== "meal" ||
        note.revision !== payload.expectedRevision || data?.generation?.status !== "pending" ||
        data.description !== payload.description || data.name !== payload.name) {
      const result = { status: "skipped", noteId: payload.noteId } as const;
      await this.notes.finishMealGeneration(payload, null, result);
      return result;
    }

    const parsed = await this.gateway.parseMeal({ text: payload.description });
    if (!parsed.recipe) throw new Error("Meal generation requires a recipe");
    const foodItems = this.totals.toFoodItems(parsed.items);
    const generated = parseMealItem({
      name: payload.name,
      description: payload.description,
      foodItems,
      totals: this.totals.calculate(foodItems),
      recipe: parsed.recipe,
      nutritionSource: "model-estimate",
      generation: { status: "completed" },
    }, 1);
    const result = { status: "completed", noteId: payload.noteId } as const;
    const applied = await this.notes.finishMealGeneration(payload, generated, result);
    return applied ? result : { status: "skipped", noteId: payload.noteId };
  }

  /** Terminal failure only; do not expose provider errors or user text in job errors. */
  async fail(payload: MealNoteGenerationPayload): Promise<MealNoteGenerationResult> {
    const failed = parseMealItem({
      name: payload.name,
      description: payload.description,
      foodItems: [],
      totals: calculateMealTotals([]),
      generation: { status: "failed" },
    }, 1);
    const result = { status: "failed", noteId: payload.noteId } as const;
    const applied = await this.notes.finishMealGeneration(payload, failed, result);
    return applied ? result : { status: "skipped", noteId: payload.noteId };
  }
}
