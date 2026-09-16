import type { OccurrenceLink } from "@repo/entities";

/** As tres colunas de ocorrencia, iguais em `events` e em `tasks`. */
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

/**
 * Colunas opcionais de proposito: as linhas montadas a mao nos testes (e as de
 * antes da serie existir) nao as trazem, e isso quer dizer "nao e ocorrencia".
 */
export function occurrenceLinkOf(row: Partial<OccurrenceColumns>): OccurrenceLink | undefined {
  if (!row.recurrenceId || !row.occurrenceOn) return undefined;
  return {
    recurrenceId: row.recurrenceId,
    occurrenceOn: row.occurrenceOn,
    detached: row.recurrenceDetached ?? false,
  };
}
