import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  TimelineEventCardDto,
  TimelineEventPageDto,
} from '@repo/entities/contracts';
import { dayEventsUrl } from '@repo/timeline';
import type { TimelinePageState } from '@repo/timeline';
import { authedFetch } from '@/lib/api/client';
import {
  LatestRequest,
  type LatestRequestToken,
} from '@/lib/events/latest-request';
import {
  dayPageOf,
  EMPTY_DAY_PAGE,
  forgetDayPage,
  mergeDayPage,
  rememberDayPage,
} from '@/lib/events/timeline-page-cache';

export interface DayEvents {
  events: TimelineEventCardDto[];
  loading: boolean;
  /** Buscando os eventos anteriores aos que ja estao na tela. */
  loadingMore: boolean;
  failed: boolean;
  /** Ha uma pagina anterior — quer dizer, mais cedo — para buscar. */
  hasMore: boolean;
  reload: () => void;
  loadMore: () => void;
}

/**
 * Os eventos de um dia civil, uma pagina por vez.
 *
 * O mobile navega por selecao direta, entao a unidade de carga e um unico dia.
 * Dentro dele a API pagina do mais novo para o mais antigo, e a lista e lida do
 * comeco do dia para o fim: a proxima pagina entra no topo, e nao no rodape.
 * Quem inverte e ordena e o `mergeDayPage`.
 *
 * O dia carregado fica no cache do modulo. `generation` invalida o cache: a tela
 * troca esse numero num refresh e todas as paginas montadas recarregam juntas.
 *
 * A chamada vai com o token — quem responde por autorizacao e ele, e nao o
 * `userId`, que aqui so serve de chave de cache. Por isso a URL do dia nao o
 * leva mais.
 */
export function useDayEvents(
  userId: string,
  dayKey: string,
  generation = 0,
): DayEvents {
  const [page, setPage] = useState<TimelinePageState>(
    () => dayPageOf(userId, dayKey) ?? EMPTY_DAY_PAGE,
  );
  const [loading, setLoading] = useState(
    () => dayPageOf(userId, dayKey) === undefined,
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const requests = useRef(new LatestRequest());

  const load = useCallback(
    async (request: LatestRequestToken) => {
      setLoading(true);
      setFailed(false);
      try {
        const response = await authedFetch<TimelineEventPageDto>(
          dayEventsUrl(dayKey),
          { signal: request.signal },
        );
        if (!requests.current.isCurrent(request)) return;
        const merged = mergeDayPage([], response);
        rememberDayPage(userId, dayKey, merged);
        setPage(merged);
      } catch {
        if (requests.current.isCurrent(request)) setFailed(true);
      } finally {
        if (requests.current.isCurrent(request)) setLoading(false);
      }
    },
    [dayKey, userId],
  );

  useEffect(() => {
    setLoadingMore(false);
    setFailed(false);
    const cached = dayPageOf(userId, dayKey);
    // O token e aberto mesmo quando nao ha o que buscar: ele e a identidade do
    // dia que esta na tela, e e nele que o `loadMore` se pendura.
    const request = requests.current.start();

    if (cached) {
      // Ja carregado nesta geracao: mostra na hora e nao vai a rede de novo.
      setPage(cached);
      setLoading(false);
      return () => requests.current.cancel();
    }

    // Ao trocar para um dia ainda nao carregado, nao deixe os cartoes do dia
    // anterior aparecerem sob o novo titulo enquanto a rede responde.
    setPage(EMPTY_DAY_PAGE);
    void load(request);
    return () => requests.current.cancel();
  }, [generation, userId, dayKey, load]);

  const reload = useCallback(() => {
    forgetDayPage(userId, dayKey);
    setLoadingMore(false);
    const request = requests.current.start();
    void load(request);
  }, [dayKey, load, userId]);

  const loadMore = useCallback(() => {
    const request = requests.current.active();
    const cursor = page.nextCursor;
    if (!request || !cursor || loadingMore) return;

    async function fetchOlder(open: LatestRequestToken, from: string) {
      setLoadingMore(true);
      try {
        const response = await authedFetch<TimelineEventPageDto>(
          dayEventsUrl(dayKey, { cursor: from }),
          { signal: open.signal },
        );
        if (!requests.current.isCurrent(open)) return;
        const merged = mergeDayPage(page.items, response);
        rememberDayPage(userId, dayKey, merged);
        setPage(merged);
      } catch {
        // A pagina que ja esta na tela continua valida: falhar ao buscar o que
        // veio antes nao e motivo para apagar o que a pessoa esta lendo.
      } finally {
        if (requests.current.isCurrent(open)) setLoadingMore(false);
      }
    }

    void fetchOlder(request, cursor);
  }, [dayKey, loadingMore, page, userId]);

  return {
    events: page.items,
    loading,
    loadingMore,
    failed,
    hasMore: page.nextCursor !== undefined,
    reload,
    loadMore,
  };
}
