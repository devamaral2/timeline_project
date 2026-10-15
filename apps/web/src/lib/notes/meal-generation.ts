import type { NoteDto } from "@/lib/api/contracts";

export const pendingMealMessage = "Preparando informações nutricionais e receita…";
export const pendingMealEditMessage = "Aguarde a geração da refeição para editar a nota.";
export const failedMealMessage = "Não foi possível gerar as informações da refeição. Seu registro foi preservado.";

export function hasPendingMeal(notes: readonly NoteDto[]): boolean {
  return notes.some((note) => note.type === "meal" && note.data.generation?.status === "pending");
}
