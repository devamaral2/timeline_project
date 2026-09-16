"use client";

import { shortDate, weekdayInitial } from "@repo/timeline";
import { cn } from "@/lib/utils";
import { fieldInputClass, fieldLabelClass } from "./field-styles";
import { previewOccurrences, type RepeatChoice, type ScheduleState } from "./schedule";

const REPEAT_LABELS: Record<RepeatChoice, string> = {
  none: "Não repete",
  daily: "Todo dia",
  weekly: "Toda semana",
  monthly: "Todo mês",
  yearly: "Todo ano",
};

const INTERVAL_UNITS: Record<Exclude<RepeatChoice, "none">, string> = {
  daily: "dia(s)",
  weekly: "semana(s)",
  monthly: "mês(es)",
  yearly: "ano(s)",
};

/** Um domingo qualquer: so serve para tirar as iniciais D S T Q Q S S. */
const WEEK_REFERENCE = ["2026-09-13", "2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19"];

interface ScheduleFieldsProps {
  value: ScheduleState;
  onChange: (value: ScheduleState) => void;
}

/**
 * Quando o evento acontece — no passado, agora ou no futuro — e se ele se
 * repete. Com repeticao, o formulario deixa de criar um evento e cria a serie.
 */
export function ScheduleFields({ value, onChange }: ScheduleFieldsProps) {
  const set = (patch: Partial<ScheduleState>) => onChange({ ...value, ...patch });
  const preview = previewOccurrences(value);

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="sr-only">Quando</legend>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="event-schedule-start" className={fieldLabelClass}>
            Início
          </label>
          <input
            id="event-schedule-start"
            type="datetime-local"
            required
            value={value.startedAt}
            onChange={(event) => set({ startedAt: event.target.value })}
            className={fieldInputClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="event-schedule-end" className={fieldLabelClass}>
            Fim
          </label>
          <input
            id="event-schedule-end"
            type="datetime-local"
            value={value.finishedAt}
            onChange={(event) => set({ finishedAt: event.target.value })}
            className={fieldInputClass}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="event-schedule-repeat" className={fieldLabelClass}>
          Repetir
        </label>
        <select
          id="event-schedule-repeat"
          value={value.repeat}
          onChange={(event) => set({ repeat: event.target.value as RepeatChoice })}
          className={fieldInputClass}
        >
          {(Object.keys(REPEAT_LABELS) as RepeatChoice[]).map((choice) => (
            <option key={choice} value={choice}>
              {REPEAT_LABELS[choice]}
            </option>
          ))}
        </select>
      </div>

      {value.repeat !== "none" ? (
        <>
          <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <label htmlFor="event-schedule-interval">A cada</label>
            <input
              id="event-schedule-interval"
              type="number"
              min={1}
              value={value.interval}
              onChange={(event) => set({ interval: Number(event.target.value) })}
              className={cn(fieldInputClass, "h-9 w-16")}
            />
            <span>{INTERVAL_UNITS[value.repeat]}</span>
          </div>

          {value.repeat === "weekly" ? (
            <fieldset className="flex gap-1.5">
              <legend className="sr-only">Dias da semana</legend>
              {WEEK_REFERENCE.map((dayKey, index) => {
                const selected = value.weekdays.includes(index);
                return (
                  <button
                    key={dayKey}
                    type="button"
                    aria-pressed={selected}
                    onClick={() =>
                      set({
                        weekdays: selected
                          ? value.weekdays.filter((day) => day !== index)
                          : [...value.weekdays, index].sort(),
                      })
                    }
                    className={cn(
                      "size-8 rounded-full border text-[12px] font-semibold transition-colors",
                      selected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-muted-foreground hover:border-brand/45",
                    )}
                  >
                    {weekdayInitial(dayKey)}
                  </button>
                );
              })}
            </fieldset>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="event-schedule-ends-on" className={fieldLabelClass}>
              Termina em
            </label>
            <input
              id="event-schedule-ends-on"
              type="date"
              value={value.endsOn}
              onChange={(event) => set({ endsOn: event.target.value })}
              className={fieldInputClass}
            />
          </div>

          {preview.length ? (
            <p className="text-[12px] text-muted-foreground">
              Próximas: {preview.map((dayKey) => shortDate(dayKey)).join(", ")}
            </p>
          ) : (
            <p className="text-[12px] text-destructive">Essa repetição não cai em nenhum dia.</p>
          )}
        </>
      ) : null}
    </fieldset>
  );
}
