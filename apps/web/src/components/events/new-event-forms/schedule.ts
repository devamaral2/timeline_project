import type {
  CreateEventInput,
  CreateEventRecurrenceInput,
  RecurrenceFrequency,
  RecurrenceRule,
} from "@/lib/api/contracts";
import {
  dayKeyOf,
  expandOccurrences,
  formatTime,
  shiftDayKey,
  TIMELINE_TIME_ZONE,
  weekdayIndexOf,
} from "@repo/timeline";
import { fromDatetimeLocalValue, toDatetimeLocalValue } from "../edit-event-forms/shared";

export type RepeatChoice = "none" | RecurrenceFrequency;

/** O "quando" do formulario de criacao, como os inputs o guardam. */
export interface ScheduleState {
  /** Valor de `datetime-local`. */
  startedAt: string;
  /** Valor de `datetime-local`; vazio e um evento sem fim declarado. */
  finishedAt: string;
  repeat: RepeatChoice;
  interval: number;
  /** Indices de dia da semana (0 = domingo) marcados, so em `weekly`. */
  weekdays: number[];
  /** Valor de `date`; vazio e uma serie sem fim. */
  endsOn: string;
}

export function initialSchedule(now: Date = new Date()): ScheduleState {
  return {
    startedAt: toDatetimeLocalValue(now.toISOString()),
    finishedAt: "",
    repeat: "none",
    interval: 1,
    weekdays: [],
    endsOn: "",
  };
}

export type EventSubmission =
  | { url: "/api/events"; body: CreateEventInput }
  | { url: "/api/recurrences"; body: CreateEventRecurrenceInput };

export class ScheduleError extends Error {}

/**
 * A regra que o formulario descreve. Dia, hora e dia da semana saem do inicio
 * escolhido, lidos no fuso da timeline — o mesmo em que a agenda vai mostrar
 * as ocorrencias.
 */
export function ruleOf(schedule: ScheduleState): RecurrenceRule | null {
  if (schedule.repeat === "none") return null;
  const startIso = fromDatetimeLocalValue(schedule.startedAt);
  if (!startIso) throw new ScheduleError("Escolha quando o evento começa.");

  const startsOn = dayKeyOf(startIso, TIMELINE_TIME_ZONE);
  const [, month, day] = startsOn.split("-").map(Number) as [number, number, number];
  const rule: RecurrenceRule = {
    frequency: schedule.repeat,
    interval: Math.max(1, Math.floor(schedule.interval) || 1),
    timeOfDay: formatTime(startIso, TIMELINE_TIME_ZONE),
    timeZone: TIMELINE_TIME_ZONE,
    startsOn,
  };

  const durationMinutes = durationOf(schedule);
  if (durationMinutes !== undefined) rule.durationMinutes = durationMinutes;

  if (schedule.repeat === "weekly") {
    const weekdays = schedule.weekdays.length ? schedule.weekdays : [weekdayIndexOf(startsOn)];
    rule.byWeekday = weekdays.reduce((mask, index) => mask | (1 << index), 0);
  }
  if (schedule.repeat === "monthly" || schedule.repeat === "yearly") rule.byMonthDay = day;
  if (schedule.repeat === "yearly") rule.byMonth = month;

  if (schedule.endsOn) {
    if (schedule.endsOn < startsOn) throw new ScheduleError("A repetição não pode terminar antes de começar.");
    rule.endsOn = schedule.endsOn;
  }
  return rule;
}

function durationOf(schedule: ScheduleState): number | undefined {
  const start = fromDatetimeLocalValue(schedule.startedAt);
  const finish = fromDatetimeLocalValue(schedule.finishedAt);
  if (!start || !finish) return undefined;
  const minutes = Math.round((new Date(finish).getTime() - new Date(start).getTime()) / 60000);
  if (minutes <= 0) throw new ScheduleError("O fim precisa ser depois do início.");
  return minutes;
}

/** Para onde o formulario manda o evento: um evento so, ou a serie. */
export function submissionOf(payload: CreateEventInput, schedule: ScheduleState): EventSubmission {
  const rule = ruleOf(schedule);
  if (rule) return { url: "/api/recurrences", body: { ...rule, target: "event", template: payload } };

  const startedAt = fromDatetimeLocalValue(schedule.startedAt);
  const finishedAt = fromDatetimeLocalValue(schedule.finishedAt);
  if (startedAt && finishedAt && finishedAt < startedAt) {
    throw new ScheduleError("O fim precisa ser depois do início.");
  }
  return { url: "/api/events", body: { ...payload, startedAt, finishedAt } };
}

/** As proximas ocorrencias, para o usuario conferir a regra antes de salvar. */
export function previewOccurrences(schedule: ScheduleState, count = 3): string[] {
  try {
    const rule = ruleOf(schedule);
    if (!rule) return [];
    return expandOccurrences(rule, rule.startsOn, shiftDayKey(rule.startsOn, 366 * 4)).slice(0, count);
  } catch {
    return [];
  }
}
