import { Recurrence, type RecurrenceRule } from "@repo/entities";
import type * as schema from "../../database/schema";

export type RecurrenceRow = typeof schema.recurrences.$inferSelect;
export type RecurrenceInsert = typeof schema.recurrences.$inferInsert;

export function mapRecurrenceRow(row: RecurrenceRow): Recurrence {
  const rule: RecurrenceRule = {
    frequency: row.freq,
    interval: row.intervalCount,
    // O Postgres devolve `time` como `HH:MM:SS`; a regra fala em minutos.
    timeOfDay: row.timeOfDay.slice(0, 5),
    timeZone: row.timeZone,
    startsOn: row.startsOn,
  };
  if (row.byWeekday !== null) rule.byWeekday = row.byWeekday;
  if (row.byMonthDay !== null) rule.byMonthDay = row.byMonthDay;
  if (row.byMonth !== null) rule.byMonth = row.byMonth;
  if (row.durationMinutes !== null) rule.durationMinutes = row.durationMinutes;
  if (row.endsOn !== null) rule.endsOn = row.endsOn;

  return Recurrence.rehydrate({
    id: row.id,
    userId: row.userId,
    target: row.targetKind,
    rule,
    template: row.template as Record<string, unknown>,
    materializedThrough: row.materializedThrough ?? undefined,
    revision: row.revision,
  });
}

export function recurrenceColumnsOf(recurrence: Recurrence): RecurrenceInsert {
  const { rule } = recurrence;
  return {
    id: recurrence.id,
    revision: recurrence.revision,
    userId: recurrence.userId,
    targetKind: recurrence.target,
    freq: rule.frequency,
    intervalCount: rule.interval,
    byWeekday: rule.byWeekday ?? null,
    byMonthDay: rule.byMonthDay ?? null,
    byMonth: rule.byMonth ?? null,
    timeOfDay: rule.timeOfDay,
    durationMinutes: rule.durationMinutes ?? null,
    timeZone: rule.timeZone,
    startsOn: rule.startsOn,
    endsOn: rule.endsOn ?? null,
    template: recurrence.template,
    materializedThrough: recurrence.materializedThrough ?? null,
  };
}
