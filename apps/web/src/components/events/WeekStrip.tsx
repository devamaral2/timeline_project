'use client';

import { dayNumber, weekOf, weekdayInitial } from '@repo/timeline';
import { cn } from '@/lib/utils';

interface WeekStripProps {
  /** O dia em foco. A semana mostrada e a dele. */
  selectedDayKey: string;
  todayKey: string;
  onSelect: (dayKey: string) => void;
}

/**
 * A regua de datas do cabecalho: os sete dias da semana do dia em foco, de
 * domingo a sabado. E a irma do `WeekStrip.tsx` do app mobile — o mesmo
 * desenho, aqui em classes em vez de `StyleSheet`.
 */
export function WeekStrip({
  selectedDayKey,
  todayKey,
  onSelect,
}: WeekStripProps) {
  return (
    <ul className="mx-auto flex w-full max-w-[400px] items-center justify-between gap-0.5">
      {weekOf(selectedDayKey).map((dayKey) => {
        const selected = dayKey === selectedDayKey;
        const isToday = dayKey === todayKey;

        return (
          <li key={dayKey}>
            <button
              type="button"
              onClick={() => onSelect(dayKey)}
              aria-current={selected ? 'date' : undefined}
              aria-label={dayKey}
              className="flex min-h-16 w-[46px] flex-col items-center gap-[5px] rounded-lg py-1 transition-colors hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
            >
              <span className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground">
                {weekdayInitial(dayKey)}
              </span>
              <span
                className={cn(
                  'flex size-8 items-center justify-center rounded-full text-[15px] tabular-nums transition-colors',
                  selected
                    ? 'bg-primary font-bold text-primary-foreground'
                    : 'font-medium text-foreground',
                )}
              >
                {dayNumber(dayKey)}
              </span>
              {/* O ponto marca hoje, para que hoje continue visivel depois de
                  navegar para longe dele. */}
              <span
                aria-hidden
                className={cn(
                  'size-[5px] rounded-full',
                  isToday ? 'bg-brand' : 'bg-transparent',
                )}
              />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
