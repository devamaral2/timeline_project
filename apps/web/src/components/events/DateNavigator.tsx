'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { mediumDate, relativeDayLabel } from '@repo/timeline';
import { cn } from '@/lib/utils';
import { DayPicker } from './DayPicker';

interface DateNavigatorProps {
  selectedDayKey: string;
  todayKey: string;
  onSelect: (dayKey: string) => void;
}

/**
 * A navegacao por data: o titulo do dia em foco, o calendario que ele abre e a
 * data por extenso. A regua semanal fica no cabecalho, logo abaixo desta peca.
 */
export function DateNavigator({
  selectedDayKey,
  todayKey,
  onSelect,
}: DateNavigatorProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const isToday = selectedDayKey === todayKey;

  function select(dayKey: string): void {
    setPickerOpen(false);
    onSelect(dayKey);
  }

  return (
    <div className="relative justify-self-center">
      <button
        type="button"
        onClick={() => setPickerOpen((open) => !open)}
        aria-expanded={pickerOpen}
        aria-haspopup="dialog"
        className="group flex max-w-[220px] flex-col items-center rounded-md px-2 py-0.5 text-center transition-colors hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
      >
        <span className="flex items-center gap-1.5">
          <span
            className={cn(
              'text-[18px] font-bold leading-6 tracking-tight',
              // Fora de hoje o titulo puxa a cor da marca: e o aviso de que a
              // tela nao esta mais no dia corrente.
              isToday ? 'text-foreground' : 'text-brand',
            )}
          >
            {relativeDayLabel(selectedDayKey, todayKey)}
          </span>
          <ChevronDown
            aria-hidden
            className={cn(
              'size-4 transition-transform',
              pickerOpen ? 'rotate-180' : null,
              isToday ? 'text-muted-foreground' : 'text-brand',
            )}
          />
        </span>
        <span className="text-xs font-medium leading-4 text-muted-foreground">
          {mediumDate(selectedDayKey)}
        </span>
      </button>

      {pickerOpen ? (
        <DayPicker
          selectedDayKey={selectedDayKey}
          todayKey={todayKey}
          onSelect={select}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}
    </div>
  );
}
