import type { FoodData } from "@repo/contracts";
import { failedMealMessage, pendingMealMessage } from "@/lib/notes/meal-generation";

export function MealGenerationStatus({ data }: { data: Pick<FoodData, "generation" | "nutritionSource"> }) {
  if (data.generation?.status === "pending") {
    return <p role="status" className="text-sm text-muted-foreground">{pendingMealMessage}</p>;
  }
  if (data.generation?.status === "failed") {
    return <p role="alert" className="text-sm text-destructive">{failedMealMessage}</p>;
  }
  return data.nutritionSource === "model-estimate"
    ? <p className="text-sm text-muted-foreground">Estimativa nutricional gerada por IA.</p>
    : null;
}
