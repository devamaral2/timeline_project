/** Com que passo a serie se repete. */
export const RECURRENCE_FREQUENCIES = ["daily", "weekly", "monthly", "yearly"] as const;
export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number];

export function isRecurrenceFrequency(value: unknown): value is RecurrenceFrequency {
  return RECURRENCE_FREQUENCIES.includes(value as RecurrenceFrequency);
}

/** O que a serie gera: eventos na timeline ou tarefas. */
export const RECURRENCE_TARGETS = ["event", "task"] as const;
export type RecurrenceTarget = (typeof RECURRENCE_TARGETS)[number];

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

/**
 * A regra de repeticao, sem nada do que ela gera.
 *
 * E um tipo puro, e nao a entidade, porque `@repo/timeline` precisa dele para
 * expandir as ocorrencias e so pode importar de `@repo/entities/contracts` --
 * e so com `import type`.
 */
export interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  /** A cada quantos dias/semanas/meses/anos. Sempre >= 1. */
  interval: number;
  /** Mascara de dias da semana. So em `weekly`. */
  byWeekday?: number;
  /** Dia do mes, 1..31. So em `monthly` e `yearly`. */
  byMonthDay?: number;
  /** Mes, 1..12. So em `yearly`. */
  byMonth?: number;
  /** Hora local de parede, `HH:MM`. */
  timeOfDay: string;
  /** Quanto dura cada ocorrencia. Ausente e uma ocorrencia sem fim declarado. */
  durationMinutes?: number;
  timeZone: string;
  /** Primeiro dia civil candidato, `YYYY-MM-DD`. */
  startsOn: string;
  /** Ultimo dia civil candidato, inclusive. Ausente e uma serie sem fim. */
  endsOn?: string;
}
