import type { Note } from "../../domain";
import type { NoteDto } from "@repo/contracts";

export function toNoteDto(note: Note): NoteDto {
  return {
    id: note.id,
    name: note.name,
    type: note.type,
    schemaVersion: note.schemaVersion,
    data: note.data,
    tags: note.tags,
    revision: note.revision,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  } as NoteDto;
}
