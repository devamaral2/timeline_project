import { NoteNotFoundError, NoteOwnershipError, NoteRevisionConflictError, type Note } from "../../../domain";
import type { NoteRepository } from "../../../domain/ports";

export class InMemoryNoteRepository implements NoteRepository {
  constructor(private notes: Note[] = []) {}

  async save(note: Note): Promise<void> {
    this.notes.push(note);
  }

  async update(note: Note, actorUserId: string, expectedRevision: number): Promise<void> {
    const index = this.notes.findIndex((stored) => stored.id === note.id);
    if (index === -1) throw new NoteNotFoundError(`Note not found: ${note.id}`);
    const existing = this.notes[index];
    if (existing.userId !== actorUserId) throw new NoteOwnershipError();
    if (existing.revision !== expectedRevision) {
      throw new NoteRevisionConflictError(`Expected revision ${expectedRevision} but found ${existing.revision}`);
    }
    this.notes[index] = note;
  }

  async delete(noteId: string, actorUserId: string): Promise<void> {
    const note = this.notes.find((stored) => stored.id === noteId);
    if (!note) throw new NoteNotFoundError(`Note not found: ${noteId}`);
    if (note.userId !== actorUserId) throw new NoteOwnershipError();
    this.notes = this.notes.filter((stored) => stored.id !== noteId);
  }

  async findById(noteId: string): Promise<Note | null> {
    return this.notes.find((note) => note.id === noteId) ?? null;
  }
}
