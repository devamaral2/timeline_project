'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TimelineEventPageDto } from '@repo/entities/contracts';
import { dayEventsUrl, mediumDate, mergeTimelinePage } from '@repo/timeline';
import type { TimelinePageState } from '@repo/timeline';
import { TimelineHeader } from '@/components/layout/TimelineHeader';
import { outlineButtonClass } from '@/components/ui/button-styles';
import { authedFetch } from '@/lib/api/authed-fetch';
import { useAuthState } from '@/lib/firebase/use-current-user';
import { DayColumn } from './DayColumn';

interface TimelineListProps {
  /** Rotulo e navegacao da rota. Nunca vai para a query — quem autoriza e o token. */
  userId: string;
  /** Dia de hoje (YYYY-MM-DD) resolvido no servidor, para evitar divergencia na hidratacao. */
  todayKey: string;
}

type LoadState = 'idle' | 'loading' | 'failed';

const EMPTY_PAGE: TimelinePageState = { items: [] };

export function TimelineList({ userId, todayKey }: TimelineListProps) {
  const { user, ready } = useAuthState();
  const [selectedDayKey, setSelectedDayKey] = useState(todayKey);
  const [page, setPage] = useState<TimelinePageState>(EMPTY_PAGE);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [loadingMore, setLoadingMore] = useState(false);
  // Respostas antigas nao podem substituir o dia escolhido depois de dois
  // toques rapidos na regua — nem a primeira pagina de um dia pode chegar
  // depois da segunda pagina do dia anterior e ressuscita-la.
  const requestVersion = useRef(0);

  const loadDay = useCallback(async (dayKey: string) => {
    const version = requestVersion.current + 1;
    requestVersion.current = version;
    setPage(EMPTY_PAGE);
    setLoadState('loading');

    try {
      const response = await authedFetch<TimelineEventPageDto>(dayEventsUrl(dayKey));
      if (requestVersion.current !== version) return;
      setPage(mergeTimelinePage([], response));
      setLoadState('idle');
    } catch {
      if (requestVersion.current === version) setLoadState('failed');
    }
  }, []);

  // Quem busca e o efeito, e nao o clique na regua: escolher um dia so troca o
  // dia escolhido. Assim o primeiro carregamento e a troca de dia sao o mesmo
  // caminho, e nenhum dos dois acontece antes de o Firebase dizer quem esta
  // logado — sem token a chamada voltaria 401 e a tela acusaria uma falha que e
  // so pressa.
  useEffect(() => {
    if (!user) return;
    void loadDay(selectedDayKey);
  }, [user, loadDay, selectedDayKey]);

  async function loadMore(): Promise<void> {
    if (!page.nextCursor || loadingMore) return;
    const version = requestVersion.current;
    setLoadingMore(true);

    try {
      const response = await authedFetch<TimelineEventPageDto>(
        dayEventsUrl(selectedDayKey, { cursor: page.nextCursor }),
      );
      if (requestVersion.current !== version) return;
      setPage((current) => mergeTimelinePage(current.items, response));
    } catch {
      // A pagina que ja esta na tela continua valida: um erro ao buscar mais
      // nao e motivo para apagar o que o usuario ja esta lendo.
    } finally {
      setLoadingMore(false);
    }
  }

  function selectDay(dayKey: string): void {
    setSelectedDayKey(dayKey);
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
        {ready && !user ? (
          <p className="rounded-2xl border border-dashed border-border bg-card/40 px-4 py-14 text-center text-sm text-muted-foreground">
            Entre na sua conta para ver esta timeline.
          </p>
        ) : loadState === 'loading' ? (
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
        ) : page.items.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border bg-card/40 px-4 py-14 text-center text-sm text-muted-foreground">
            Nenhum evento registrado neste dia.
          </p>
        ) : (
          <>
            <DayColumn
              day={{
                dayKey: selectedDayKey,
                isToday: selectedDayKey === todayKey,
                events: page.items,
              }}
            />

            {/* Sem cursor nao ha proxima pagina — e o botao some em vez de
                ficar la prometendo o que nao existe. */}
            {page.nextCursor ? (
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  className={outlineButtonClass}
                  disabled={loadingMore}
                  onClick={() => void loadMore()}
                >
                  {loadingMore ? 'Carregando...' : 'Carregar mais'}
                </button>
              </div>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}
