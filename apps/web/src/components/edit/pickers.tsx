"use client";

import { CalendarDays, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  WEEKDAY_LETTERS,
  dayLabel,
  dayLongLabel,
  isDayKey,
  monthGrid,
  monthOf,
  monthTitle,
  shiftDayByMonths,
  shiftDayKey,
  todayKey,
} from "./calendar";
import { editStyles as edit } from "./edit-parts";
import { OptionList, Popover } from "./popover";
import styles from "./pickers.module.css";

interface PickerProps {
  id?: string;
  /** O nome do campo ("Data de início"): o leitor de tela lê o nome e o valor, e os testes o procuram por ele. */
  label: string;
  invalid?: boolean;
  describedBy?: string;
}

interface DatePickerProps extends PickerProps {
  /** `YYYY-MM-DD`, ou vazio: sem data. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

/**
 * O campo de data: uma pílula que mostra o dia ("14 nov 2026") e abre um calendário do mês. Setas andam de dia em
 * dia, PageUp e PageDown de mês em mês. "Limpar" tira a data e "Hoje" escolhe o dia de hoje. No celular o calendário
 * sobe do pé como uma folha. Não usa o `<input type="date">`: o seletor dele muda de aparelho para aparelho.
 */
export function DatePicker({ id, label, value, onChange, invalid = false, describedBy, placeholder = "Data" }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const uid = useId();
  const filled = isDayKey(value);

  return (
    <>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        className={`${edit.control} ${edit.date}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-labelledby={`${uid}-label ${uid}-value`}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        data-value={value}
        onClick={() => setOpen((current) => !current)}
      >
        <span id={`${uid}-label`} className={edit.srOnly}>{label}</span>
        <CalendarDays className={edit.icon} aria-hidden />
        <span id={`${uid}-value`} className={edit.controlText} data-empty={filled ? undefined : ""}>{filled ? dayLabel(value) : placeholder}</span>
      </button>
      {open ? (
        <Popover anchor={buttonRef} label={label} dialog onClose={() => setOpen(false)}>
          <Calendar
            value={filled ? value : ""}
            onPick={(next) => {
              onChange(next);
              setOpen(false);
              buttonRef.current?.focus();
            }}
          />
        </Popover>
      ) : null}
    </>
  );
}

function Calendar({ value, onPick }: { value: string; onPick: (value: string) => void }) {
  const today = useMemo(() => todayKey(), []);
  const start = value || today;
  const [cursor, setCursor] = useState(start);
  const view = monthOf(cursor);
  const { year, month } = view;
  const weeks = useMemo(() => monthGrid({ year, month }), [year, month]);
  const gridRef = useRef<HTMLDivElement>(null);
  // O foco só vai atrás do dia quando o teclado o moveu (e ao abrir): tocar nas setas do mês não o rouba.
  const follow = useRef(true);

  useEffect(() => {
    if (!follow.current) return;
    follow.current = false;
    gridRef.current?.querySelector<HTMLElement>("[data-cursor]")?.focus();
  }, [cursor]);

  function go(next: string) {
    follow.current = true;
    setCursor(next);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, string> = {
      ArrowLeft: shiftDayKey(cursor, -1),
      ArrowRight: shiftDayKey(cursor, 1),
      ArrowUp: shiftDayKey(cursor, -7),
      ArrowDown: shiftDayKey(cursor, 7),
      PageUp: shiftDayByMonths(cursor, -1),
      PageDown: shiftDayByMonths(cursor, 1),
    };
    const next = moves[event.key];
    if (!next) return;
    event.preventDefault();
    go(next);
  }

  return (
    <div className={styles.calendar}>
      <div className={styles.head}>
        <button type="button" className={styles.step} aria-label="Mês anterior" onClick={() => setCursor(shiftDayByMonths(cursor, -1))}>
          <ChevronLeft className={styles.stepIcon} aria-hidden />
        </button>
        <span className={styles.title} aria-live="polite">{monthTitle(view)}</span>
        <button type="button" className={styles.step} aria-label="Próximo mês" onClick={() => setCursor(shiftDayByMonths(cursor, 1))}>
          <ChevronRight className={styles.stepIcon} aria-hidden />
        </button>
      </div>
      {/* biome-ignore lint/a11y/useSemanticElements: a grade de dias é um grupo de botões, não uma tabela de dados. */}
      <div ref={gridRef} role="group" aria-label={monthTitle(view)} className={styles.grid} onKeyDown={onKeyDown}>
        {WEEKDAY_LETTERS.map((letter, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: as sete letras são fixas e repetem (S, T, Q).
          <span key={index} className={styles.weekday} aria-hidden>{letter}</span>
        ))}
        {weeks.flat().map((day, index) =>
          day ? (
            <button
              key={day}
              type="button"
              className={styles.day}
              aria-label={dayLongLabel(day)}
              aria-pressed={day === value}
              tabIndex={day === cursor ? 0 : -1}
              data-cursor={day === cursor ? "" : undefined}
              data-today={day === today ? "" : undefined}
              onClick={() => onPick(day)}
            >
              {Number(day.slice(8))}
            </button>
          ) : (
            // biome-ignore lint/suspicious/noArrayIndexKey: o vazio só ocupa a coluna.
            <span key={`blank-${index}`} aria-hidden />
          ),
        )}
      </div>
      <div className={styles.foot}>
        <button type="button" className={edit.textAction} disabled={!value} onClick={() => onPick("")}>Limpar</button>
        <button type="button" className={edit.textAction} data-strong onClick={() => onPick(today)}>Hoje</button>
      </div>
    </div>
  );
}

interface TimePickerProps extends PickerProps {
  /** `HH:MM`, ou vazio: sem hora (o evento é do dia inteiro). */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

const HOURS = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0"));
const MINUTE_STEP = 5;
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Os minutos de 5 em 5; um horário que já estava no campo e não cai na grade (18:32) entra na lista para continuar escolhível. */
function minutesFor(current: string | null): string[] {
  const grid = Array.from({ length: 60 / MINUTE_STEP }, (_, index) => String(index * MINUTE_STEP).padStart(2, "0"));
  if (current && !grid.includes(current)) grid.push(current);
  return grid.sort();
}

/**
 * O campo de hora: uma pílula que mostra "18:30" e abre duas colunas, horas e minutos (de 5 em 5), no relógio de 24
 * horas. Escolher a hora deixa o painel aberto para escolher o minuto; escolher o minuto fecha. "Limpar" tira a hora.
 */
export function TimePicker({ id, label, value, onChange, invalid = false, describedBy, placeholder = "Hora" }: TimePickerProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const uid = useId();
  const match = TIME.exec(value);
  const hour = match?.[1] ?? null;
  const minute = match?.[2] ?? null;
  const minutes = useMemo(() => minutesFor(minute), [minute]);

  function close() {
    setOpen(false);
    buttonRef.current?.focus();
  }

  return (
    <>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        className={`${edit.control} ${edit.time}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-labelledby={`${uid}-label ${uid}-value`}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        data-value={value}
        onClick={() => setOpen((current) => !current)}
      >
        <span id={`${uid}-label`} className={edit.srOnly}>{label}</span>
        <Clock className={edit.icon} aria-hidden />
        <span id={`${uid}-value`} className={edit.controlText} data-empty={match ? undefined : ""}>{match ? value : placeholder}</span>
      </button>
      {open ? (
        <Popover anchor={buttonRef} label={label} dialog onClose={() => setOpen(false)}>
          <div className={styles.time}>
            <div className={styles.columns}>
              <div className={styles.column}>
                <span className={styles.columnLabel} aria-hidden>Hora</span>
                <OptionList
                  label="Hora"
                  className={styles.wheel}
                  options={HOURS.map((item) => ({ value: item, label: item }))}
                  value={hour}
                  autoFocus
                  centerSelected
                  onPick={(next) => onChange(`${next}:${minute ?? "00"}`)}
                />
              </div>
              <div className={styles.column}>
                <span className={styles.columnLabel} aria-hidden>Minuto</span>
                <OptionList
                  label="Minuto"
                  className={styles.wheel}
                  options={minutes.map((item) => ({ value: item, label: item }))}
                  value={minute}
                  centerSelected
                  onPick={(next) => {
                    onChange(`${hour ?? "09"}:${next}`);
                    close();
                  }}
                />
              </div>
            </div>
            <div className={styles.foot}>
              <button
                type="button"
                className={edit.textAction}
                disabled={!match}
                onClick={() => {
                  onChange("");
                  close();
                }}
              >
                Limpar
              </button>
              <button type="button" className={edit.textAction} data-strong onClick={close}>Concluir</button>
            </div>
          </div>
        </Popover>
      ) : null}
    </>
  );
}
