import type { MealItem } from "../types/meal-item";
import type { SleepItem } from "../types/sleep-item";
import type { TextNote } from "../types/text-note";
import type { TrainingData, TrainingInputData } from "../types/training-data";

export type KnownNoteType = "text" | "meal" | "sleep" | "training";

export interface NoteDtoOf<TType extends KnownNoteType, TData> {
  id: string;
  name: string;
  type: TType;
  schemaVersion: number;
  data: TData;
  tags: string[];
  revision: number;
  createdAt: string;
  updatedAt: string;
}

/** Uma note: `type` + `schemaVersion` dizem que forma o `data` tem. */
export type NoteDto =
  | NoteDtoOf<"text", TextNote>
  | NoteDtoOf<"meal", MealItem>
  | NoteDtoOf<"sleep", SleepItem>
  | NoteDtoOf<"training", TrainingData>;

export interface MealCreateInput {
  inputText: string;
}

interface NoteInputBase {
  name?: string;
  tags?: string[];
}

/**
 * Uma note nova. `type` ausente e texto livre. A refeicao entra como texto
 * (`inputText`) e passa pelo modelo; o treino resolve os nomes pelo catalogo.
 */
export type CreateNoteInput =
  | (NoteInputBase & { type?: "text"; data: TextNote })
  | (NoteInputBase & { type: "meal"; data: MealCreateInput })
  | (NoteInputBase & { type: "sleep"; data?: Partial<SleepItem> })
  | (NoteInputBase & { type: "training"; data?: TrainingInputData });

export type NoteDataInput =
  | { type: "text"; data: TextNote }
  | { type: "meal"; data: MealItem }
  | { type: "sleep"; data: SleepItem }
  | { type: "training"; data: TrainingData };

/**
 * Uma entrada da lista de notes de um evento ao editar. Com `id` e sem `data`,
 * a note existente so entra (ou continua) na lista; com `id` e `data`, ela
 * tambem e editada; sem `id`, nasce uma note nova com o `data` completo.
 */
export type UpdateEventNoteInput =
  | (NoteInputBase & { id: string; type?: undefined; data?: undefined })
  | (NoteInputBase & { id?: string; schemaVersion?: number } & NoteDataInput);
