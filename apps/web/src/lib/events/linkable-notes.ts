import type { EventDetailDto, EventKind, NoteDto } from "@/lib/api/contracts";

/**
 * O tipo de note que cabe a cada natureza de evento: refeicao, sono e treino
 * levam a note do proprio tipo; a rotina nao tem note propria e leva texto
 * livre. E o que decide o que a edicao oferece para associar.
 */
export function noteTypeForEventKind(kind: EventKind): NoteDto["type"] {
  return kind === "routine" ? "text" : kind;
}

/**
 * As notes que o usuario pode associar a este evento: as do tipo adequado que
 * ainda nao estao nele. Notes de outros tipos nunca entram na lista.
 */
export function linkableNotesOf(notes: readonly NoteDto[], event: EventDetailDto): NoteDto[] {
  const type = noteTypeForEventKind(event.kind);
  const linked = new Set(event.notes.map((note) => note.id));
  return notes.filter((note) => note.type === type && !linked.has(note.id));
}

/** Como o tipo aparece nos textos da edicao ("refeição", "sono"...). */
export const noteTypeLabels: Record<NoteDto["type"], string> = {
  text: "texto",
  meal: "refeição",
  sleep: "sono",
  training: "treino",
};
