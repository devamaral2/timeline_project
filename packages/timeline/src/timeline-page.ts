import type { TimelineEventCardDto, TimelineEventPageDto } from "@repo/entities/contracts";

/** Os eventos ja carregados de um dia e o cursor da proxima pagina, se houver. */
export interface TimelinePageState {
  items: TimelineEventCardDto[];
  nextCursor?: string;
}

/**
 * Junta uma pagina recem-chegada ao que ja estava na tela.
 *
 * A deduplicacao por id nao e zelo excessivo: entre uma pagina e a seguinte o
 * usuario pode criar um evento, e o cursor — que aponta para uma posicao na
 * ordem `(startedAt, id)` — devolveria o mesmo cartao duas vezes. Sem cursor na
 * resposta, acabou a lista: e por isso que `nextCursor` some em vez de virar
 * string vazia.
 */
export function mergeTimelinePage(
  current: readonly TimelineEventCardDto[],
  page: TimelineEventPageDto,
): TimelinePageState {
  const merged = [...current];
  const seen = new Set(current.map((event) => event.id));

  for (const event of page.items) {
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    merged.push(event);
  }

  return { items: merged, nextCursor: page.nextCursor };
}
