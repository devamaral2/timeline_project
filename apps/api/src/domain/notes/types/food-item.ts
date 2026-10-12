import { ulid } from "ulid";
import { NoteValidationError } from "../errors/note.errors";

export interface FoodItemMacronutrients {
  carbohydratesGrams: number;
  proteinsGrams: number;
  totalFatGrams: number;
  fiberGrams: number;
}

export interface FoodItem {
  id: string;
  sourceFoodId?: string;
  sourceFoodRevision?: number;
  name: string;
  portion: string;
  approximateWeightGrams: number;
  caloriesKcal: number;
  macronutrients: FoodItemMacronutrients;
  /**
   * @deprecated Micronutrientes deixaram de existir. Sempre `{}`: o campo so
   * continua na saida porque o app Android instalado o exige na decodificacao.
   */
  micronutrients: Record<string, never>;
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export function parseFoodItem(data: unknown): FoodItem {
  if (typeof data !== "object" || data === null) {
    throw new NoteValidationError("Food item must be an object");
  }

  const source = data as Record<string, unknown>;

  if (!isNonEmptyString(source.name)) {
    throw new NoteValidationError("Food item requires a name");
  }
  if (!isNonEmptyString(source.portion)) {
    throw new NoteValidationError("Food item requires a portion");
  }
  if (!isFiniteNonNegative(source.approximateWeightGrams)) {
    throw new NoteValidationError("Food item requires a non-negative approximateWeightGrams");
  }
  if (!isFiniteNonNegative(source.caloriesKcal)) {
    throw new NoteValidationError("Food item requires non-negative caloriesKcal");
  }

  const macronutrients = source.macronutrients as Record<string, unknown> | undefined;
  if (typeof macronutrients !== "object" || macronutrients === null) {
    throw new NoteValidationError("Food item requires macronutrients");
  }
  for (const key of ["carbohydratesGrams", "proteinsGrams", "totalFatGrams", "fiberGrams"] as const) {
    if (!isFiniteNonNegative(macronutrients[key])) {
      throw new NoteValidationError(`Food item macronutrients.${key} must be a non-negative number`);
    }
  }

  const foodItem: FoodItem = {
    id: isNonEmptyString(source.id) ? source.id : ulid(),
    name: source.name,
    portion: source.portion,
    approximateWeightGrams: source.approximateWeightGrams as number,
    caloriesKcal: source.caloriesKcal as number,
    macronutrients: {
      carbohydratesGrams: macronutrients.carbohydratesGrams as number,
      proteinsGrams: macronutrients.proteinsGrams as number,
      totalFatGrams: macronutrients.totalFatGrams as number,
      fiberGrams: macronutrients.fiberGrams as number,
    },
    // Payload antigo pode trazer `micronutrients`: e aceito e descartado.
    micronutrients: {},
  };

  if (isNonEmptyString(source.sourceFoodId)) {
    foodItem.sourceFoodId = source.sourceFoodId;
  }
  if (typeof source.sourceFoodRevision === "number") {
    foodItem.sourceFoodRevision = source.sourceFoodRevision;
  }

  return foodItem;
}
