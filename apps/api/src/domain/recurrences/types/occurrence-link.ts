/**
 * O vinculo de um evento ou tarefa com a serie que o gerou.
 *
 * `detached` marca a ocorrencia que o usuario mexeu a mao: editar a serie
 * regera as ocorrencias futuras, mas nao passa por cima dessas.
 */
export interface OccurrenceLink {
  recurrenceId: string;
  /** Dia civil da ocorrencia, no fuso da regra. */
  occurrenceOn: string;
  detached: boolean;
}

/** Qualquer edicao feita pelo usuario destaca a ocorrencia da serie. */
export function detachOccurrence(link: OccurrenceLink | undefined): OccurrenceLink | undefined {
  return link ? { ...link, detached: true } : undefined;
}
