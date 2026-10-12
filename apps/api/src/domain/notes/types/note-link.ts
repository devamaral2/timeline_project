import { NoteValidationError } from "../errors/note.errors";

/** Teto de `position` (smallint) nas tabelas de intersecao. */
export const MAX_NOTE_LINKS = 32767;

/**
 * O vinculo de uma note a um evento, tarefa ou serie. A ordem do array e a
 * posicao da note no alvo; `fromRecurrence` marca o vinculo herdado da serie,
 * para que editar a serie e editar uma ocorrencia nao mexam um no outro.
 */
export interface NoteLink {
  noteId: string;
  fromRecurrence: boolean;
}

export function normalizeNoteLinks(links: readonly NoteLink[]): NoteLink[] {
  if (links.length > MAX_NOTE_LINKS) {
    throw new NoteValidationError(`A target accepts at most ${MAX_NOTE_LINKS} notes`);
  }
  const seen = new Set<string>();
  for (const link of links) {
    if (seen.has(link.noteId)) {
      throw new NoteValidationError(`Duplicate note link: ${link.noteId}`);
    }
    seen.add(link.noteId);
  }
  return links.map((link) => ({ noteId: link.noteId, fromRecurrence: link.fromRecurrence }));
}

/** Notes soltas por padrao: `fromRecurrence` so e verdadeiro quando a serie copia o vinculo. */
export function ownLinksOf(noteIds: readonly string[]): NoteLink[] {
  return noteIds.map((noteId) => ({ noteId, fromRecurrence: false }));
}
