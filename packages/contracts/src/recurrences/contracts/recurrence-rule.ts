export type RecurrenceFrequency = "daily" | "weekly" | "monthly" | "yearly";
export type RecurrenceTarget = "event" | "task";

/** Dados compartilhados da regra; a validacao e propriedade do dominio da API. */
export interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  interval: number;
  byWeekday?: number;
  byMonthDay?: number;
  byMonth?: number;
  timeOfDay: string;
  durationMinutes?: number;
  timeZone: string;
  startsOn: string;
  endsOn?: string;
}
