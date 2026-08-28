import { useCallback, useEffect, useRef, useState } from 'react';
import type { TimelineEventCardDto } from '@repo/entities/contracts';
import { dayEventsUrl } from '@repo/timeline';
import { apiFetch } from '@/lib/api/client';
import {
  LatestRequest,
  type LatestRequestToken,
} from '@/lib/events/latest-request';

/**
 * O mobile navega por selecao direta, entao a unidade de carga aqui e um unico
 * dia — sem janela incremental nem carrossel.
 *
 * O resultado fica neste cache de modulo: voltar a um dia mostra o que ja foi
 * carregado em vez de piscar um spinner e pedir de novo a mesma coisa.
 */
const cache = new Map<string, TimelineEventCardDto[]>();

function cacheKey(userId: string, dayKey: string): string {
  return `${userId}|${dayKey}`;
}

/** Descarta tudo o que foi carregado — depois de criar, editar ou apagar um evento. */
export function clearDayEventsCache(): void {
  cache.clear();
}

export interface DayEvents {
  events: TimelineEventCardDto[];
  loading: boolean;
  failed: boolean;
  reload: () => void;
}

/**
 * Os eventos de um dia civil. `generation` invalida o cache: a tela troca esse
 * numero num refresh e todas as paginas montadas recarregam juntas.
 */
export function useDayEvents(
  userId: string,
  dayKey: string,
  generation = 0,
): DayEvents {
  const key = cacheKey(userId, dayKey);
  const [events, setEvents] = useState<TimelineEventCardDto[]>(
    () => cache.get(key) ?? [],
  );
  const [loading, setLoading] = useState(() => !cache.has(key));
  const [failed, setFailed] = useState(false);
  const requests = useRef(new LatestRequest());

  const load = useCallback(
    async (request: LatestRequestToken) => {
      setLoading(true);
      setFailed(false);
      try {
        const batch = await apiFetch<TimelineEventCardDto[]>(
          dayEventsUrl(userId, dayKey),
          { signal: request.signal },
        );
        if (!requests.current.isCurrent(request)) return;
        const sorted = [...batch].sort((left, right) =>
          left.startedAt.localeCompare(right.startedAt),
        );
        cache.set(key, sorted);
        setEvents(sorted);
      } catch {
        if (requests.current.isCurrent(request)) setFailed(true);
      } finally {
        if (requests.current.isCurrent(request)) setLoading(false);
      }
    },
    [dayKey, key, userId],
  );

  useEffect(() => {
    requests.current.cancel();
    const cached = cache.get(key);
    if (cached) {
      // Ja carregado nesta geracao: mostra na hora e nao vai a rede de novo.
      setEvents(cached);
      setLoading(false);
      setFailed(false);
      return () => requests.current.cancel();
    }
    // Ao trocar para um dia ainda nao carregado, nao deixe os cartoes do dia
    // anterior aparecerem sob o novo titulo enquanto a rede responde.
    setEvents([]);
    setFailed(false);
    const request = requests.current.start();
    void load(request);
    return () => requests.current.cancel();
  }, [generation, key, load]);

  const reload = useCallback(() => {
    cache.delete(key);
    const request = requests.current.start();
    void load(request);
  }, [key, load]);

  return { events, loading, failed, reload };
}
