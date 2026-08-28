'use client';

import { useCallback, useRef, useState } from 'react';
import type { TimelineEventCardDto } from '@repo/entities/contracts';
import { dayEventsUrl, mediumDate } from '@repo/timeline';
import { TimelineHeader } from '@/components/layout/TimelineHeader';
import { outlineButtonClass } from '@/components/ui/button-styles';
import { DayColumn } from './DayColumn';

interface TimelineListProps {
  userId: string;
  /** Eventos de hoje, ja renderizados no servidor. */
  initialEvents: TimelineEventCardDto[];
  /** Dia de hoje (YYYY-MM-DD) resolvido no servidor, para evitar divergencia na hidratacao. */
  todayKey: string;
}

type LoadState = 'idle' | 'loading' | 'failed';

export function TimelineList({
  userId,
  initialEvents,
  todayKey,
}: TimelineListProps) {
  const [selectedDayKey, setSelectedDayKey] = useState(todayKey);
  const [events, setEvents] = useState<TimelineEventCardDto[]>(initialEvents);
  const [loadState, setLoadState] = useState<LoadState>('idle');
  // Respostas antigas nao podem substituir o dia escolhido depois de dois
  // toques rapidos na regua.
  const requestVersion = useRef(0);

  const loadDay = useCallback(
    async (dayKey: string) => {
      const version = requestVersion.current + 1;
      requestVersion.current = version;
      setSelectedDayKey(dayKey);
      setLoadState('loading');

      try {
        const response = await fetch(dayEventsUrl(userId, dayKey));
        if (!response.ok)
          throw new Error(`Day request failed with ${response.status}`);
        const batch = (await response.json()) as TimelineEventCardDto[];
        if (requestVersion.current !== version) return;
        setEvents(batch);
        setLoadState('idle');
      } catch {
        if (requestVersion.current === version) setLoadState('failed');
      }
    },
    [userId],
  );

  function selectDay(dayKey: string): void {
    if (dayKey !== selectedDayKey) void loadDay(dayKey);
  }

  return (
    <div className="min-h-screen">
      <TimelineHeader
        userId={userId}
        selectedDayKey={selectedDayKey}
        todayKey={todayKey}
        onSelectDay={selectDay}
      />

      <main className="mx-auto max-w-[900px] px-4 py-6 sm:px-6 sm:py-8">
        {loadState === 'loading' ? (
          <p
            role="status"
            className="py-14 text-center text-sm text-muted-foreground"
          >
            Carregando {mediumDate(selectedDayKey)}...
          </p>
        ) : loadState === 'failed' ? (
          <div className="flex flex-col items-center gap-3 py-14">
            <p className="text-sm text-muted-foreground">
              Não foi possível carregar {mediumDate(selectedDayKey)}.
            </p>
            <button
              type="button"
              className={outlineButtonClass}
              onClick={() => void loadDay(selectedDayKey)}
            >
              Tentar novamente
            </button>
          </div>
        ) : events.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border bg-card/40 px-4 py-14 text-center text-sm text-muted-foreground">
            Nenhum evento registrado neste dia.
          </p>
        ) : (
          <DayColumn
            day={{
              dayKey: selectedDayKey,
              isToday: selectedDayKey === todayKey,
              events,
            }}
          />
        )}
      </main>
    </div>
  );
}
