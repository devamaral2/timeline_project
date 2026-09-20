import type { RecurrenceRule } from "@repo/contracts";
import { shiftDayKey, zonedTimeAt } from "./format-date";
import { weekdayIndexOf } from "./week";

const DAY_MS = 24 * 60 * 60 * 1000;

function partsOf(dayKey: string): [number, number, number] {
  return dayKey.split("-").map(Number) as [number, number, number];
}

function dayNumberOf(dayKey: string): number {
  const [year, month, day] = partsOf(dayKey);
  return Math.round(Date.UTC(year, month - 1, day) / DAY_MS);
}

function monthNumberOf(dayKey: string): number {
  const [year, month] = partsOf(dayKey);
  return year * 12 + (month - 1);
}

function matches(rule: RecurrenceRule, dayKey: string): boolean {
  const [year, month, day] = partsOf(dayKey);
  const [startYear] = partsOf(rule.startsOn);

  switch (rule.frequency) {
    case "daily":
      return (dayNumberOf(dayKey) - dayNumberOf(rule.startsOn)) % rule.interval === 0;

    case "weekly": {
      if (((rule.byWeekday ?? 0) & (1 << weekdayIndexOf(dayKey))) === 0) return false;
      // As semanas contam de domingo a sabado, a partir da semana de `startsOn`.
      const sunday = dayNumberOf(dayKey) - weekdayIndexOf(dayKey);
      const firstSunday = dayNumberOf(rule.startsOn) - weekdayIndexOf(rule.startsOn);
      return ((sunday - firstSunday) / 7) % rule.interval === 0;
    }

    // Dia 31 num mes de 30 dias nao casa com dia nenhum: o mes e pulado, e nao
    // grudado no ultimo dia. "Todo dia 31" e "todo ultimo dia" sao regras diferentes.
    case "monthly":
      return (
        day === rule.byMonthDay &&
        (monthNumberOf(dayKey) - monthNumberOf(rule.startsOn)) % rule.interval === 0
      );

    case "yearly":
      return (
        month === rule.byMonth &&
        day === rule.byMonthDay &&
        (year - startYear) % rule.interval === 0
      );
  }
}

/**
 * Os dias civis (`YYYY-MM-DD`) em que a regra cai, de `fromDay` a `toDay`,
 * inclusive, ja recortados por `startsOn`/`endsOn` e sem os dias pulados.
 */
export function expandOccurrences(
  rule: RecurrenceRule,
  fromDay: string,
  toDay: string,
  exceptions: ReadonlySet<string> = new Set(),
): string[] {
  const first = fromDay > rule.startsOn ? fromDay : rule.startsOn;
  const last = rule.endsOn && rule.endsOn < toDay ? rule.endsOn : toDay;
  const days: string[] = [];
  for (let dayKey = first; dayKey <= last; dayKey = shiftDayKey(dayKey, 1)) {
    if (matches(rule, dayKey) && !exceptions.has(dayKey)) days.push(dayKey);
  }
  return days;
}

/** O inicio e o fim da ocorrencia daquele dia. */
export function occurrenceWindow(
  rule: RecurrenceRule,
  dayKey: string,
): { startedAt: Date; finishedAt?: Date } {
  const startedAt = zonedTimeAt(dayKey, rule.timeOfDay, rule.timeZone);
  if (rule.durationMinutes === undefined) return { startedAt };
  return { startedAt, finishedAt: new Date(startedAt.getTime() + rule.durationMinutes * 60_000) };
}
