import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TimelineEventCardDto } from "@repo/entities/contracts";
import {
  EMPTY_WINDOWS_UNTIL_END,
  dayKeyOf,
  groupEventsByDay,
  timelineWindowUrl,
  type TimelineDay,
} from "@repo/timeline";
import { apiFetch } from "@/lib/api/client";

export interface Timeline {
  days: TimelineDay[];
  loading: boolean;
  /** Verdadeiro so durante um `refresh`, para o indicador de puxar-para-atualizar. */
  refreshing: boolean;
  /** Nenhuma janela a mais tem eventos: o fim da timeline. */
  reachedEnd: boolean;
  failed: boolean;
  /** Carrega a proxima janela de dias. Ignorada enquanto uma carga esta em voo. */
  loadMore: () => void;
  /** Descarta tudo e recomeca da janela atual — depois de criar ou apagar um evento. */
  refresh: () => void;
}

/**
 * Mesma paginacao do web: janelas de 8 dias andando para tras, terminando
 * depois de algumas janelas vazias seguidas. A diferenca e o gatilho — la e um
 * IntersectionObserver num sentinel, aqui e o `onEndReached` da lista.
 */
export function useTimeline(userId: string): Timeline {
  // Fixo entre as janelas para que a serie continue de um mesmo instante: se
  // cada carga usasse `new Date()`, uma virada de meia-noite no meio do scroll
  // deslocaria as janelas seguintes em um dia.
  const [now, setNow] = useState(() => new Date());
  const [events, setEvents] = useState<TimelineEventCardDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [reachedEnd, setReachedEnd] = useState(false);
  const [failed, setFailed] = useState(false);

  const loadingRef = useRef(false);
  const reachedEndRef = useRef(false);
  const nextWindowRef = useRef(0);
  const emptyStreakRef = useRef(0);
  // Um `refresh` no meio de uma carga invalida a resposta que ainda vem vindo.
  const generationRef = useRef(0);

  const loadWindow = useCallback(async () => {
    if (loadingRef.current || reachedEndRef.current) return;
    loadingRef.current = true;
    const generation = generationRef.current;
    setLoading(true);
    setFailed(false);

    try {
      const batch = await apiFetch<TimelineEventCardDto[]>(
        timelineWindowUrl(userId, nextWindowRef.current, now),
      );
      if (generation !== generationRef.current) return;

      nextWindowRef.current += 1;
      if (batch.length === 0) {
        emptyStreakRef.current += 1;
        if (emptyStreakRef.current >= EMPTY_WINDOWS_UNTIL_END) {
          reachedEndRef.current = true;
          setReachedEnd(true);
        }
      } else {
        emptyStreakRef.current = 0;
        setEvents((current) => [...current, ...batch]);
      }
    } catch {
      if (generation === generationRef.current) setFailed(true);
    } finally {
      if (generation === generationRef.current) {
        loadingRef.current = false;
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [now, userId]);

  // Dispara na montagem e a cada `refresh`, que troca o `now` por um novo.
  useEffect(() => {
    void loadWindow();
  }, [loadWindow]);

  const refresh = useCallback(() => {
    generationRef.current += 1;
    loadingRef.current = false;
    reachedEndRef.current = false;
    nextWindowRef.current = 0;
    emptyStreakRef.current = 0;
    setEvents([]);
    setReachedEnd(false);
    setFailed(false);
    setRefreshing(true);
    setNow(new Date());
  }, []);

  const days = useMemo(() => groupEventsByDay(events, dayKeyOf(now)), [events, now]);

  return {
    days,
    loading,
    refreshing,
    reachedEnd,
    failed,
    loadMore: () => void loadWindow(),
    refresh,
  };
}
