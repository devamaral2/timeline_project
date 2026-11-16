import { dayKeyOf, shiftDayKey } from "@repo/timeline";

/** Um mês do calendário: `month` de 1 a 12. */
export interface MonthCursor {
  year: number;
  month: number;
}

export const MONTH_NAMES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
] as const;

/** Domingo primeiro, como o bitmask da recorrência. */
export const WEEKDAY_LETTERS = ["D", "S", "T", "Q", "Q", "S", "S"] as const;

const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDayKey(value: string): boolean {
  const match = DAY_KEY.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function dayKeyFrom(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** O mês de um dia `YYYY-MM-DD`. */
export function monthOf(dayKey: string): MonthCursor {
  const match = DAY_KEY.exec(dayKey);
  return { year: Number(match?.[1]), month: Number(match?.[2]) };
}

export function sameMonth(first: MonthCursor, second: MonthCursor): boolean {
  return first.year === second.year && first.month === second.month;
}

export function shiftMonth(cursor: MonthCursor, delta: number): MonthCursor {
  const index = cursor.year * 12 + (cursor.month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12 + 12) % 12 + 1 };
}

/** O mesmo dia daqui a `delta` meses; num mês mais curto cai no último dia dele. */
export function shiftDayByMonths(dayKey: string, delta: number): string {
  const match = DAY_KEY.exec(dayKey);
  const day = Number(match?.[3]);
  const target = shiftMonth(monthOf(dayKey), delta);
  return dayKeyFrom(target.year, target.month, Math.min(day, daysInMonth(target)));
}

export function daysInMonth(cursor: MonthCursor): number {
  return new Date(Date.UTC(cursor.year, cursor.month, 0)).getUTCDate();
}

/** "novembro de 2026". */
export function monthTitle(cursor: MonthCursor): string {
  return `${MONTH_NAMES[cursor.month - 1]} de ${cursor.year}`;
}

/** As semanas do mês, de domingo a sábado; os dias de fora do mês vêm como `null`. */
export function monthGrid(cursor: MonthCursor): (string | null)[][] {
  const lead = new Date(Date.UTC(cursor.year, cursor.month - 1, 1)).getUTCDay();
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let day = 1; day <= daysInMonth(cursor); day += 1) cells.push(dayKeyFrom(cursor.year, cursor.month, day));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let start = 0; start < cells.length; start += 7) weeks.push(cells.slice(start, start + 7));
  return weeks;
}

export function todayKey(now: Date = new Date()): string {
  return dayKeyOf(now);
}

export { shiftDayKey };

/** "14 nov 2026", para a pílula; o dia escrito errado volta vazio. */
export { compactDate as dayLabel, longDate as dayLongLabel } from "@repo/timeline";
