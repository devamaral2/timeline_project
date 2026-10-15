import type { MealItem } from "@/lib/api/contracts";
import { failedMealMessage, pendingMealMessage } from "@/lib/notes/meal-generation";

export function MealGenerationStatus({ data }: { data: MealItem }) {
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
