import type { Event, Note } from "../../domain";
import type { EventDetailDto } from "@repo/contracts";
import { toNoteDto } from "./note.dto";

/**
 * `notes` sao as notes do evento em qualquer ordem: a ordem e a dos vinculos
 * (`event.noteLinks`), e uma note apagada (soft delete) simplesmente nao aparece.
 */
export function toEventDetailDto(event: Event, notes: readonly Note[] = []): EventDetailDto {
  const byId = new Map(notes.map((note) => [note.id, note]));
  return {
    id: event.id,
    name: event.name,
    description: event.description,
    startedAt: event.startedAt.toISOString(),
    finishedAt: event.finishedAt?.toISOString(),
    tags: event.tags,
    missed: event.missed,
    priority: event.priority,
    notifyOffsetsMinutes: [...event.notifyOffsetsMinutes],
    interruptions: event.interruptions.map((interruption) => ({
      id: interruption.id,
      name: interruption.name,
      description: interruption.description,
      startedAt: interruption.startedAt.toISOString(),
      finishedAt: interruption.finishedAt.toISOString(),
    })),
    revision: event.revision,
    kind: event.kind,
    notes: event.noteLinks.flatMap((link) => {
      const note = byId.get(link.noteId);
      return note ? [toNoteDto(note)] : [];
    }),
  };
}
