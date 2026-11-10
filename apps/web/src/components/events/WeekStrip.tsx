'use client';

import { dayNumber, longDate, weekday, weekOf } from '@repo/timeline';
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
              aria-label={longDate(dayKey)}
              className="flex w-[46px] flex-col items-center gap-1 rounded-[10px] py-1 transition-colors hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="text-xs text-muted-foreground">
                {weekday(dayKey).slice(0, 3)}
              </span>
              {/* Como os números do calendário do mês: hoje na cor da marca e o
                  dia em foco num retângulo suave. */}
              <span
                className={cn(
                  'flex h-10 w-full items-center justify-center rounded-[10px] text-xs tabular-nums transition-colors',
                  selected
                    ? 'bg-[var(--cyan-soft)] font-semibold text-[var(--brand-accent)]'
                    : isToday
                      ? 'text-[var(--brand-accent)]'
                      : 'text-foreground',
                )}
              >
                {dayNumber(dayKey)}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
