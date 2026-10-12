import type { Note } from "../entities/note.entity";

/**
 * As notes que viajam com um evento ou tarefa na mesma transacao: as novas e
 * as editadas. A `expectedRevision` e a revisao lida quando a edicao foi montada.
 */
export interface NoteWrites {
  created?: readonly Note[];
  updated?: readonly { note: Note; expectedRevision: number }[];
}
