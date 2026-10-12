import type { Note } from "../entities/note.entity";

export interface NoteRepository {
  save(note: Note): Promise<void>;
  update(note: Note, actorUserId: string, expectedRevision: number): Promise<void>;
  delete(noteId: string, actorUserId: string): Promise<void>;
  findById(noteId: string): Promise<Note | null>;
  /** As notes que existem e nao foram apagadas; ids ausentes ficam de fora, e a ordem nao e a dos ids. */
  findByIds(noteIds: readonly string[]): Promise<Note[]>;
  /** As notes do usuario, da editada mais recentemente para a mais antiga. */
  listByUserId(userId: string): Promise<Note[]>;
}
