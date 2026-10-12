import type { Event, Note } from "../../../domain";

/**
 * Estado compartilhado entre EventRepository, TagRepository, NoteRepository e
 * as query ports em memoria, para que tags e notes gravadas atomicamente com
 * eventos aparecam nas leituras — espelhando a transacao unica do repositorio
 * PostgreSQL.
 */
export class InMemoryEventDatabase {
  events: Event[];
  /** Mutado no lugar: o `InMemoryNoteRepository` compartilha esta mesma lista. */
  readonly notes: Note[];

  constructor(events: Event[] = [], notes: Note[] = []) {
    this.events = [...events];
    this.notes = [...notes];
  }

  /** As notes vivas de um evento, na ordem dos vinculos. */
  notesOf(event: Event): Note[] {
    return event.noteLinks.flatMap((link) => {
      const note = this.notes.find((candidate) => candidate.id === link.noteId);
      return note ? [note] : [];
    });
  }

  writeNotes(writes: { created?: readonly Note[]; updated?: readonly { note: Note }[] } | undefined): void {
    for (const note of writes?.created ?? []) this.notes.push(note);
    for (const { note } of writes?.updated ?? []) {
      const index = this.notes.findIndex((stored) => stored.id === note.id);
      if (index !== -1) this.notes[index] = note;
    }
  }
}
