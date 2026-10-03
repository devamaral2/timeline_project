import type { NoteDto, NoteLinkDto } from "@repo/contracts";
import type { Note } from "../../domain";

export function toNoteDto(note: Note, link?: NoteLinkDto): NoteDto {
  return {
    id: note.id,
    content: note.content,
    name: note.name,
    taskId: note.taskId,
    eventId: note.eventId,
    ...(link ? { link } : {}),
    tags: note.tags,
    revision: note.revision,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}
