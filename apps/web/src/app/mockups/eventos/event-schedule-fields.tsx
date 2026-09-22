"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import styles from "./mockup.module.css";

export type DateField = "startDate" | "endDate";

const weekDays = [
  { key: "sun", label: "D" },
  { key: "mon", label: "S" },
  { key: "tue", label: "T" },
  { key: "wed", label: "Q" },
  { key: "thu", label: "Q" },
  { key: "fri", label: "S" },
  { key: "sat", label: "S" },
];
const longDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});
const monthFormatter = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });

function dateFromIso(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function isoFromDate(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

export function shortDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

export function longDate(value: string) {
  const formatted = longDateFormatter.format(dateFromIso(value));
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

export function parseShortDate(value: string) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) return null;
  const [, day, month, year] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  if (date.getFullYear() !== Number(year) || date.getMonth() !== Number(month) - 1 || date.getDate() !== Number(day)) return null;
  return isoFromDate(date);
}

export function maskDate(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function maskTime(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (digits.length >= 2 && Number(digits.slice(0, 2)) > 23) return null;
  if (digits.length === 4 && Number(digits.slice(2)) > 59) return null;
  return digits.length <= 2 ? digits : `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

export function CalendarPicker({ value, onChange, onClose }: { value: string; onChange: (value: string) => void; onClose: () => void }) {
  const selected = dateFromIso(value);
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(selected.getFullYear(), selected.getMonth(), 1));
  const firstWeekDay = visibleMonth.getDay();
  const daysInMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0).getDate();
  const emptyCells = Array.from({ length: firstWeekDay }, (_, emptySlot) => ({
    key: `empty-${visibleMonth.getFullYear()}-${visibleMonth.getMonth()}-${emptySlot}`,
    day: null,
  }));
  const monthCells = Array.from({ length: daysInMonth }, (_, dayIndex) => {
    const day = dayIndex + 1;
    const candidate = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), day);
    return { key: isoFromDate(candidate), day };
  });
  const cells = [...emptyCells, ...monthCells];

  function changeMonth(offset: number) {
    setVisibleMonth(current => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  }

  return <div className={styles.pickerCalendar}>
    <div className={styles.eventDatePickerHeading}>
      <strong>{monthFormatter.format(visibleMonth)}</strong>
      <span>
        <button type="button" aria-label="Mês anterior" onClick={() => changeMonth(-1)}><ChevronLeft aria-hidden /></button>
        <button type="button" aria-label="Próximo mês" onClick={() => changeMonth(1)}><ChevronRight aria-hidden /></button>
      </span>
    </div>
    <div className={styles.eventDateWeek} aria-hidden>{weekDays.map(({ key, label }) => <span key={key}>{label}</span>)}</div>
    <div className={styles.eventDateGrid}>
      {cells.map(({ key, day }) => day === null ? <span key={key} /> : (() => {
        const candidateIso = key;
        return <button type="button" key={candidateIso} aria-label={longDate(candidateIso)} aria-pressed={candidateIso === value} onClick={() => {
          onChange(candidateIso);
          onClose();
        }}>{day}</button>;
      })())}
    </div>
  </div>;
}

function DateTimeRow({ label, field, date, time, calendarOpen, onDateChange, onTimeChange, onOpenCalendar }: {
  label: string;
  field: DateField;
  date: string;
  time: string;
  calendarOpen: boolean;
  onDateChange: (field: DateField, value: string) => void;
  onTimeChange: (value: string) => void;
  onOpenCalendar: (field: DateField) => void;
}) {
  const [editingDate, setEditingDate] = useState(false);
  const [dateText, setDateText] = useState(() => shortDate(date));
  const [timeText, setTimeText] = useState(time);

  function finishDateEditing() {
    const parsed = parseShortDate(dateText);
    if (parsed) onDateChange(field, parsed);
    else setDateText(shortDate(date));
    setEditingDate(false);
  }

  return <div className={styles.eventDateTimeRow}>
    <span className={styles.eventDateTimeLabel}>{label}</span>
    <div className={styles.eventDateControl}>
      <input
        aria-label={`${label}: data`}
        inputMode="numeric"
        maxLength={10}
        value={editingDate ? dateText : longDate(date)}
        onFocus={() => { setDateText(shortDate(date)); setEditingDate(true); }}
        onChange={event => setDateText(maskDate(event.target.value))}
        onBlur={finishDateEditing}
      />
      <button type="button" aria-label={`Abrir calendário de ${label.toLocaleLowerCase("pt-BR")}`} aria-haspopup="dialog" aria-expanded={calendarOpen} onClick={() => onOpenCalendar(field)}><CalendarDays aria-hidden /></button>
    </div>
    <input
      className={styles.eventTimeInput}
      aria-label={`${label}: horário`}
      inputMode="numeric"
      maxLength={5}
      placeholder="00:00"
      value={timeText}
      onChange={event => {
        const masked = maskTime(event.target.value);
        if (masked !== null) setTimeText(masked);
      }}
      onBlur={() => {
        if (/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(timeText)) onTimeChange(timeText);
        else setTimeText(time);
      }}
    />
  </div>;
}

export function EventScheduleFields({ startDate, startTime, endDate, endTime, activeField, onChange, onOpenCalendar }: {
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  activeField: DateField | null;
  onChange: (field: DateField | "startTime" | "endTime", value: string) => void;
  onOpenCalendar: (field: DateField) => void;
}) {
  return <div className={styles.eventSchedule}>
    <DateTimeRow label="Início" field="startDate" date={startDate} time={startTime} calendarOpen={activeField === "startDate"} onDateChange={onChange} onTimeChange={value => onChange("startTime", value)} onOpenCalendar={onOpenCalendar} />
    <DateTimeRow label="Término" field="endDate" date={endDate} time={endTime} calendarOpen={activeField === "endDate"} onDateChange={onChange} onTimeChange={value => onChange("endTime", value)} onOpenCalendar={onOpenCalendar} />
  </div>;
}
