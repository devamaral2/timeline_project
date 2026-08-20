"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TimelineEventCardDto } from "@/models/events/application/dtos/timeline-event-card.dto";
import { EMPTY_WINDOWS_UNTIL_END, timelineWindowUrl } from "@/lib/timeline/date-window";
import { groupEventsByDay } from "@/lib/timeline/group-events-by-day";
import { DayColumn } from "./DayColumn";
import { DaySkeleton } from "./DaySkeleton";

interface TimelineListProps {
  userId: string;
  /** Eventos da janela 0, ja renderizados no servidor. */
  initialEvents: TimelineEventCardDto[];
  /** Dia de hoje (YYYY-MM-DD) resolvido no servidor, para evitar divergencia na hidratacao. */
  todayKey: string;
  /** Instante de referencia do servidor, para que as janelas seguintes continuem a serie. */
  nowIso: string;
}

export function TimelineList({ userId, initialEvents, todayKey, nowIso }: TimelineListProps) {
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const [events, setEvents] = useState<TimelineEventCardDto[]>(initialEvents);
  const [loading, setLoading] = useState(false);
  const [reachedEnd, setReachedEnd] = useState(false);
  const [failed, setFailed] = useState(false);
  // Um contador que muda a cada carga concluida e reinicia o observer, para o
  // caso de o sentinel continuar visivel depois de uma janela vazia.
  const [pass, setPass] = useState(0);

  const isLoadingRef = useRef(false);
  const nextWindowRef = useRef(1);
  const emptyStreakRef = useRef(0);
  const verticalSentinel = useRef<HTMLDivElement>(null);
  const horizontalSentinel = useRef<HTMLDivElement>(null);

  const days = useMemo(() => groupEventsByDay(events, todayKey), [events, todayKey]);

  const loadMore = useCallback(async () => {
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;
    setLoading(true);
    setFailed(false);

    try {
      const response = await fetch(timelineWindowUrl(userId, nextWindowRef.current, now));
      if (!response.ok) throw new Error(`Timeline request failed with ${response.status}`);
      const batch = (await response.json()) as TimelineEventCardDto[];
      nextWindowRef.current += 1;

      if (batch.length === 0) {
        emptyStreakRef.current += 1;
        if (emptyStreakRef.current >= EMPTY_WINDOWS_UNTIL_END) setReachedEnd(true);
      } else {
        emptyStreakRef.current = 0;
        setEvents((current) => [...current, ...batch]);
      }
    } catch {
      setFailed(true);
    } finally {
      isLoadingRef.current = false;
      setLoading(false);
      setPass((value) => value + 1);
    }
  }, [now, userId]);

  useEffect(() => {
    if (reachedEnd || failed) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore();
      },
      { rootMargin: "200px" },
    );
    if (verticalSentinel.current) observer.observe(verticalSentinel.current);
    if (horizontalSentinel.current) observer.observe(horizontalSentinel.current);
    return () => observer.disconnect();
  }, [loadMore, reachedEnd, failed, pass]);

  if (days.length === 0 && reachedEnd) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-card/50 px-4 py-10 text-center text-sm text-muted-foreground">
        Nenhum evento registrado nesta timeline ainda.
      </p>
    );
  }

  return (
    <>
      {/* Mobile e tablet: timeline vertical */}
      <div className="flex flex-col gap-10 md:grid md:grid-cols-2 md:gap-8 lg:hidden">
        {days.map((day) => (
          <DayColumn key={day.dayKey} day={day} variant="vertical" />
        ))}
        {loading ? <DaySkeleton variant="vertical" /> : null}
        <div ref={verticalSentinel} className="h-4" />
      </div>

      {/* Desktop: colunas com scroll horizontal */}
      <div
        className="scrollbar-slim hidden snap-x snap-mandatory gap-6 overflow-x-auto pb-6 lg:flex"
        tabIndex={0}
        role="region"
        aria-label="Timeline horizontal de dias — use as setas para navegar"
      >
        {days.map((day) => (
          <DayColumn key={day.dayKey} day={day} variant="column" />
        ))}
        {loading ? <DaySkeleton variant="column" /> : null}
        <div ref={horizontalSentinel} className="w-4 shrink-0" />
      </div>

      {failed ? (
        <div className="mt-6 flex flex-col items-center gap-3">
          <p className="text-sm text-muted-foreground">Não foi possível carregar mais eventos.</p>
          <button
            type="button"
            onClick={() => void loadMore()}
            className="inline-flex min-h-11 items-center rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Tentar novamente
          </button>
        </div>
      ) : null}

      {reachedEnd && days.length > 0 ? (
        <p className="mt-6 text-center text-[13px] text-muted-foreground">
          Você chegou ao fim da timeline.
        </p>
      ) : null}

      <p aria-live="polite" className="sr-only">
        {loading ? "Carregando mais dias da timeline" : `${days.length} dias carregados`}
      </p>
    </>
  );
}
