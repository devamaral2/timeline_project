import { Note, NoteValidationError } from "../../../../domain";

export interface NoteRow {
  id: string;
  revision: number;
  userId: string;
  name: string;
  type: string;
  schemaVersion: number;
  data: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export function mapNoteRow(row: NoteRow, tags: string[] = []): Note {
  try {
    return Note.rehydrate({
      id: row.id,
      userId: row.userId,
      name: row.name,
      type: row.type,
      schemaVersion: row.schemaVersion,
      data: row.data,
      tags,
      revision: row.revision,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new NoteValidationError(`Invalid note ${row.id}: ${message}`);
  }
}
