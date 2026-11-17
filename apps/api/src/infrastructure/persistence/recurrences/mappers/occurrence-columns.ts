import type { OccurrenceLink } from "../../../../domain";

/** As tres colunas de `tasks` que ligam uma ocorrencia a serie dela. */
export interface OccurrenceColumns {
  recurrenceId: string | null;
  occurrenceOn: string | null;
  recurrenceDetached: boolean;
}

export function occurrenceColumnsOf(link: OccurrenceLink | undefined): OccurrenceColumns {
  return {
    recurrenceId: link?.recurrenceId ?? null,
    occurrenceOn: link?.occurrenceOn ?? null,
    recurrenceDetached: link?.detached ?? false,
  };
}

/** Colunas opcionais de proposito: uma linha montada a mao sem elas quer dizer "nao e ocorrencia". */
export function occurrenceLinkOf(row: Partial<OccurrenceColumns>): OccurrenceLink | undefined {
  if (!row.recurrenceId || !row.occurrenceOn) return undefined;
  return {
    recurrenceId: row.recurrenceId,
    occurrenceOn: row.occurrenceOn,
    detached: row.recurrenceDetached ?? false,
  };
}
