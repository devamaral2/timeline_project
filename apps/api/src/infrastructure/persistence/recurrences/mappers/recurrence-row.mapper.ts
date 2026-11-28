import { Recurrence, type RecurrenceRule } from "../../../../domain";
import type { InsertOf } from "@repo/sqlite";
import type { recurrences, RecurrenceRow } from "../../database/tables";

export type { RecurrenceRow };
export type RecurrenceInsert = InsertOf<typeof recurrences.columns>;

export function mapRecurrenceRow(row: RecurrenceRow): Recurrence {
  const rule: RecurrenceRule = {
    frequency: row.freq,
    interval: row.intervalCount,
    // A regra fala em minutos; o Postgres de antes gravava `HH:MM:SS`.
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
    rule,
    template: row.template as Record<string, unknown>,
    materializedThrough: row.materializedThrough ?? undefined,
    revision: row.revision,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

/** As colunas da regra. O projeto nao e da regra: quem grava resolve (`resolveProjectId`). */
export function recurrenceColumnsOf(recurrence: Recurrence): Omit<RecurrenceInsert, "projectId"> {
  const { rule } = recurrence;
  return {
    id: recurrence.id,
    revision: recurrence.revision,
    userId: recurrence.userId,
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
    createdAt: recurrence.createdAt,
    updatedAt: recurrence.updatedAt,
  };
}
