import type { RecurrenceFrequency, RecurrenceTarget } from "@repo/contracts";
export type { RecurrenceFrequency, RecurrenceRule, RecurrenceTarget } from "@repo/contracts";

/** Com que passo a serie se repete. */
export const RECURRENCE_FREQUENCIES = ["daily", "weekly", "monthly", "yearly"] as const;

export function isRecurrenceFrequency(value: unknown): value is RecurrenceFrequency {
  return RECURRENCE_FREQUENCIES.includes(value as RecurrenceFrequency);
}

/** O que a serie gera: eventos na timeline ou tarefas. */
export const RECURRENCE_TARGETS = ["event", "task"] as const;

export function isRecurrenceTarget(value: unknown): value is RecurrenceTarget {
  return RECURRENCE_TARGETS.includes(value as RecurrenceTarget);
}

/**
 * Bits de `byweekday`, domingo primeiro — a mesma ordem que `weekdayIndexOf`
 * devolve em `@repo/timeline`, para que a mascara e o indice conversem sem
 * tabela de traducao no meio.
 */
export const ALL_WEEKDAYS = 0b111_1111;

export function weekdayBit(weekdayIndex: number): number {
  return 1 << weekdayIndex;
}
