import type { CreateNoteInput } from "./note.dto";

/** `POST /api/notes`: a note, e os eventos e tarefas em que ela ja nasce aparecendo. */
export type CreateNoteRequest = CreateNoteInput & {
  eventIds?: string[];
  taskIds?: string[];
};
