import { Note } from "../entities/note.entity";

export interface NoteRepository {
  save(note: Note): Promise<void>;
  findById(id: string): Promise<Note | null>;
  findByUserId(userId: string): Promise<Note[]>;
  findByTarget(taskId?: string, eventId?: string, planId?: string): Promise<Note[]>;
  delete(id: string): Promise<void>;
}
