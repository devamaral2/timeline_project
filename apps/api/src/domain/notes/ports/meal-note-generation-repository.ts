import type { Note } from "../entities/note.entity";
import type { MealItem } from "../types/meal-item";

/** Immutable user input captured when the note is inserted, never read from a catalog. */
export interface MealNoteGenerationPayload {
  noteId: string;
  userId: string;
  expectedRevision: number;
  description: string;
  name: string;
}

export interface MealNoteGenerationResult {
  status: "completed" | "skipped" | "failed";
  noteId: string;
}

export interface MealNoteGenerationRepository {
  findById(noteId: string): Promise<Note | null>;
  /** Compare-and-set and job receipt share one transaction. Null data only records a skip. */
  finishMealGeneration(
    payload: MealNoteGenerationPayload,
    data: MealItem | null,
    result: MealNoteGenerationResult,
  ): Promise<boolean>;
}
