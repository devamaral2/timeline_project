import type { TimelineEventCardDto, TimelineEventPageDto } from "@repo/entities/contracts";
import { mergeTimelinePage, type TimelinePageState } from "@repo/timeline";

/** Um dia ainda sem nenhuma pagina carregada. */
export const EMPTY_DAY_PAGE: TimelinePageState = { items: [] };

/**
 * A inversao de direcao mora aqui.
 *
 * O backend pagina do mais novo para o mais antigo — a primeira pagina de um dia
 * traz o fim dele —, e a lista e lida de cima para baixo, da primeira hora a
 * ultima. Sem reordenar, a segunda pagina cairia depois da primeira e o dia
 * apareceria com as 7h abaixo das 9h.
 *
 * A deduplicacao vem do `mergeTimelinePage`, que web e mobile dividem: entre uma
 * pagina e a seguinte a pessoa pode criar um evento, e o cursor — que aponta para
 * uma posicao na ordem `(startedAt, id)` — devolveria o mesmo cartao duas vezes.
 */
export function mergeDayPage(
  current: readonly TimelineEventCardDto[],
  page: TimelineEventPageDto,
): TimelinePageState {
  const merged = mergeTimelinePage(current, page);
  return { items: sortedByStart(merged.items), nextCursor: merged.nextCursor };
}

/**
 * Ordem crescente de inicio, com o id como criterio de desempate — a mesma
 * `(startedAt, id)` que o backend usa para paginar. Dois eventos que comecaram
 * no mesmo instante precisam sair sempre na mesma ordem, senao eles trocam de
 * lugar a cada pagina que chega.
 */
function sortedByStart(events: readonly TimelineEventCardDto[]): TimelineEventCardDto[] {
  return [...events].sort(
    (left, right) =>
      left.startedAt.localeCompare(right.startedAt) || left.id.localeCompare(right.id),
  );
}

/**
 * O que ja foi carregado, por conta e por dia civil.
 *
 * Voltar a um dia mostra o que ja esta na mao em vez de piscar um spinner e
 * pedir de novo a mesma coisa. A conta entra na chave porque um aparelho pode
 * trocar de usuario sem reiniciar o processo, e os cartoes de um nao podem
 * aparecer para o outro.
 */
const pages = new Map<string, TimelinePageState>();

function cacheKey(userId: string, dayKey: string): string {
  return `${userId}|${dayKey}`;
}

export function dayPageOf(userId: string, dayKey: string): TimelinePageState | undefined {
  return pages.get(cacheKey(userId, dayKey));
}

export function rememberDayPage(userId: string, dayKey: string, page: TimelinePageState): void {
  pages.set(cacheKey(userId, dayKey), page);
}

export function forgetDayPage(userId: string, dayKey: string): void {
  pages.delete(cacheKey(userId, dayKey));
}

/** Descarta tudo — depois de criar, editar ou apagar um evento. */
export function clearDayPages(): void {
  pages.clear();
}
