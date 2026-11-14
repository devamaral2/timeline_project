import type { RecurrenceFrequency } from "@repo/contracts";
export type { RecurrenceFrequency, RecurrenceRule } from "@repo/contracts";

/** Com que passo a serie se repete. */
export const RECURRENCE_FREQUENCIES = ["daily", "weekly", "monthly", "yearly"] as const;

export function isRecurrenceFrequency(value: unknown): value is RecurrenceFrequency {
  return RECURRENCE_FREQUENCIES.includes(value as RecurrenceFrequency);
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
