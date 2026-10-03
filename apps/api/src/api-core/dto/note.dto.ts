import type { Note } from "../../domain";
import type { NoteLinkSummary } from "../../domain/ports";
import type { NoteDto, NoteLinkDto } from "@repo/contracts";

export function toNoteLinkDto(link: NoteLinkSummary): NoteLinkDto {
  return {
    kind: link.kind,
    id: link.id,
    name: link.name,
    ...(link.eventKind ? { eventKind: link.eventKind } : {}),
    ...(link.at ? { at: link.at.toISOString() } : {}),
  };
}

/** `links`: onde a note aparece. Ausente nas notes que viajam dentro de um evento ou da resposta do agente. */
export function toNoteDto(note: Note, links?: readonly NoteLinkSummary[]): NoteDto {
  return {
    id: note.id,
    name: note.name,
    type: note.type,
    schemaVersion: note.schemaVersion,
    data: note.data,
    ...(links ? { links: links.map(toNoteLinkDto) } : {}),
    tags: note.tags,
    revision: note.revision,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  } as NoteDto;
}
