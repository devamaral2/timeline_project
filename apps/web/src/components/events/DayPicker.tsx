"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  dayNumber,
  isSameMonth,
  monthGridOf,
  monthLabel,
  shiftMonthKey,
  weekOf,
  weekdayInitial,
} from "@repo/timeline";
import { cn } from "@/lib/utils";
import { outlineButtonClass } from "@/components/ui/button-styles";

interface DayPickerProps {
  selectedDayKey: string;
  todayKey: string;
  onSelect: (dayKey: string) => void;
  onClose: () => void;
}

/**
 * O calendario que o chevron do titulo abre.
 *
 * A regua da semana resolve o dia a dia; este resolve o salto longo — o mes
 * passado, uma data qualquer — que ninguem faz uma semana por vez. E o irmao do
 * `DayPicker.tsx` do app mobile.
 */
export function DayPicker({ selectedDayKey, todayKey, onSelect, onClose }: DayPickerProps) {
  // O mes folheado. Comeca no mes do dia em foco a cada abertura, porque o
  // componente so existe enquanto o calendario esta aberto.
  const [monthKey, setMonthKey] = useState(selectedDayKey);
  const panel = useRef<HTMLDivElement>(null);

  // Esc fecha, e um clique fora tambem: o calendario e um popover, nao um
  // modal — o resto da pagina continua legivel atras dele.
  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (event.key === "Escape") onClose();
    }
    function onPointerDown(event: PointerEvent): void {
      if (!panel.current?.contains(event.target as Node)) onClose();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [onClose]);

  return (
    <div
      ref={panel}
      role="dialog"
      aria-label="Escolher data"
      className="absolute left-1/2 top-full z-40 mt-2 w-[320px] -translate-x-1/2 rounded-xl border border-border bg-card p-4 shadow-card-hover"
    >
      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label="Mês anterior"
          onClick={() => setMonthKey((current) => shiftMonthKey(current, -1))}
          className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
        >
          <ChevronLeft aria-hidden className="size-5" />
        </button>
        <p className="text-[15.5px] font-bold tracking-tight text-foreground">
          {monthLabel(monthKey)}
        </p>
        <button
          type="button"
          aria-label="Próximo mês"
          onClick={() => setMonthKey((current) => shiftMonthKey(current, 1))}
          className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
        >
          <ChevronRight aria-hidden className="size-5" />
        </button>
      </div>

      <div aria-hidden className="mt-2 grid grid-cols-7">
        {weekOf(monthKey).map((dayKey) => (
          <span
            key={dayKey}
            className="text-center text-[11px] font-semibold tracking-wide text-muted-foreground"
          >
            {weekdayInitial(dayKey)}
          </span>
        ))}
      </div>

      <div className="mt-1.5 grid grid-cols-7">
        {monthGridOf(monthKey).map((dayKey) => {
          const selected = dayKey === selectedDayKey;
          const isToday = dayKey === todayKey;
          const outsideMonth = !isSameMonth(dayKey, monthKey);

          return (
            <button
              key={dayKey}
              type="button"
              aria-label={dayKey}
              aria-current={selected ? "date" : undefined}
              onClick={() => onSelect(dayKey)}
              className="flex justify-center py-0.5"
            >
              <span
                className={cn(
                  "flex size-9 items-center justify-center rounded-full text-sm tabular-nums transition-colors",
                  selected
                    ? "bg-brand font-bold text-primary-foreground"
                    : isToday
                      ? "font-bold text-brand hover:bg-foreground/5"
                      : "font-medium text-foreground hover:bg-foreground/5",
                  // Os dias das bordas pertencem ao mes vizinho.
                  outsideMonth && !selected ? "opacity-35" : null,
                )}
              >
                {dayNumber(dayKey)}
              </span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => onSelect(todayKey)}
        className={cn(outlineButtonClass, "mt-3 w-full justify-center")}
      >
        Hoje
      </button>
    </div>
  );
}
