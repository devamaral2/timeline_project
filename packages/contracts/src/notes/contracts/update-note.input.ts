import type { NoteDataInput } from "./note.dto";

interface UpdateNoteBase {
  noteId: string;
  expectedRevision: number;
  name?: string;
  tags?: string[];
  /**
   * Os eventos e tarefas em que a note aparece, a lista completa: quem sai da
   * lista perde o vinculo (a note continua existindo), quem entra a recebe no
   * fim. Ausente, os vinculos ficam como estao.
   */
  eventIds?: string[];
  taskIds?: string[];
}

/** `PATCH /api/notes/:noteId`. Com `type`, o `data` e o novo conteudo inteiro. */
export type UpdateNoteRequest = UpdateNoteBase &
  ({ type?: undefined; data?: undefined } | (NoteDataInput & { schemaVersion?: number }));
