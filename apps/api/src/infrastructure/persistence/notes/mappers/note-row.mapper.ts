import { Note } from "../../../../domain";

export interface NoteRow {
  id: string;
  revision: number;
  userId: string;
  content: string;
  name: string;
  eventId: string | null;
  taskId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function mapNoteRow(row: NoteRow, tags: string[] = []): Note {
  return Note.rehydrate({
    id: row.id,
    userId: row.userId,
    content: row.content,
    name: row.name,
    eventId: row.eventId,
    taskId: row.taskId,
    tags,
    revision: row.revision,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}
