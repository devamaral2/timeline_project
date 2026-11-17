'use client';

import { dayNumber, longDate, weekday, weekOf } from '@repo/timeline';
import type { CSSProperties } from 'react';
import styles from '@/components/agenda/agenda.module.css';

interface WeekStripProps {
  /** O dia em foco. A semana mostrada e a dele. */
  selectedDayKey: string;
  todayKey: string;
  onSelect: (dayKey: string) => void;
}

/**
 * A regua de datas da agenda: os sete dias da semana do dia em foco, de domingo
 * a sabado. O dia escolhido e preenchido em `--primary`, numa marca que desliza
 * de um dia para o outro; hoje leva o ponto da
 * marca embaixo do numero. E a irma do `WeekStrip.kt` do app Android.
 */
export function WeekStrip({ selectedDayKey, todayKey, onSelect }: WeekStripProps) {
  const days = weekOf(selectedDayKey);
  return (
    // A marca do dia escolhido é uma só e desliza até a coluna dele (`--week-index`).
    <ul className={styles.week} style={{ '--week-index': Math.max(0, days.indexOf(selectedDayKey)) } as CSSProperties}>
      {days.map((dayKey) => {
        const isToday = dayKey === todayKey;
        return (
          <li key={dayKey}>
            <button
              type="button"
              className={styles.weekDay}
              onClick={() => onSelect(dayKey)}
              aria-current={dayKey === selectedDayKey ? 'date' : undefined}
              aria-label={isToday ? `${longDate(dayKey)}, hoje` : longDate(dayKey)}
              data-today={isToday || undefined}
            >
              <span>{weekday(dayKey).slice(0, 3)}</span>
              <strong>{dayNumber(dayKey)}</strong>
              <i aria-hidden />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
