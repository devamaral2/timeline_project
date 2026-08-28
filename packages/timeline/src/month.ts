import { shiftDayKey } from "./format-date";
import { DAYS_IN_WEEK, weekdayIndexOf } from "./week";

const MONTHS_TITLE = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

/** Seis semanas cobrem qualquer mes — inclusive fevereiro comecando no sabado. */
export const WEEKS_IN_MONTH_GRID = 6;

function partsOf(dayKey: string): [number, number, number] {
  return dayKey.split("-").map(Number) as [number, number, number];
}

function keyOf(year: number, month: number, day: number): string {
  const padded = (value: number): string => String(value).padStart(2, "0");
  return `${year}-${padded(month)}-${padded(day)}`;
}

/** "Maio de 2026" — o titulo do seletor de data. */
export function monthLabel(dayKey: string): string {
  const [year, month] = partsOf(dayKey);
  return `${MONTHS_TITLE[month - 1] ?? ""} de ${year}`;
}

/** Verdadeiro quando as duas chaves caem no mesmo mes do mesmo ano. */
export function isSameMonth(dayKey: string, other: string): boolean {
  return dayKey.slice(0, 7) === other.slice(0, 7);
}

/** Quantos dias tem o mes daquela chave. */
export function daysInMonthOf(dayKey: string): number {
  const [year, month] = partsOf(dayKey);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * O mesmo dia `delta` meses adiante (ou atras), preso ao ultimo dia quando o
 * mes de destino e mais curto: 31 de marco menos um mes e 28 de fevereiro, e
 * nao 3 de marco — que e onde a aritmetica de dias cairia.
 */
export function shiftMonthKey(dayKey: string, delta: number): string {
  const [year, month, day] = partsOf(dayKey);
  const target = new Date(Date.UTC(year, month - 1 + delta, 1));
  const targetKey = keyOf(target.getUTCFullYear(), target.getUTCMonth() + 1, 1);
  return keyOf(
    target.getUTCFullYear(),
    target.getUTCMonth() + 1,
    Math.min(day, daysInMonthOf(targetKey)),
  );
}

/** Primeiro dia do mes daquela chave. */
export function firstDayOfMonth(dayKey: string): string {
  const [year, month] = partsOf(dayKey);
  return keyOf(year, month, 1);
}

/**
 * A grade do calendario: seis semanas de domingo a sabado cobrindo o mes de
 * `dayKey`, com as bordas completadas pelos dias dos meses vizinhos.
 *
 * O tamanho e sempre o mesmo de proposito — uma grade que encolhe faz o
 * calendario inteiro pular de altura ao trocar de mes.
 */
export function monthGridOf(dayKey: string): string[] {
  const first = firstDayOfMonth(dayKey);
  const start = shiftDayKey(first, -weekdayIndexOf(first));
  return Array.from({ length: WEEKS_IN_MONTH_GRID * DAYS_IN_WEEK }, (_, offset) =>
    shiftDayKey(start, offset),
  );
}
