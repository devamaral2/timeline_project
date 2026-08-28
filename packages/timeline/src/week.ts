import { shiftDayKey } from "./format-date";

/** Dias de uma semana, de domingo a sabado — a linha do seletor de data. */
export const DAYS_IN_WEEK = 7;

/**
 * Indice do dia da semana (0 = domingo) de uma chave YYYY-MM-DD.
 *
 * Le a chave como UTC de proposito: a chave ja e a data civil no fuso da
 * timeline, entao converter de novo so reintroduziria o fuso duas vezes.
 */
export function weekdayIndexOf(dayKey: string): number {
  const [year, month, day] = dayKey.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** As sete chaves da semana que contem `dayKey`, de domingo a sabado. */
export function weekOf(dayKey: string): string[] {
  const sunday = shiftDayKey(dayKey, -weekdayIndexOf(dayKey));
  return Array.from({ length: DAYS_IN_WEEK }, (_, offset) => shiftDayKey(sunday, offset));
}

/** `count` chaves seguidas a partir de `startKey`, inclusive. */
export function dayKeyRange(startKey: string, count: number): string[] {
  return Array.from({ length: Math.max(0, count) }, (_, offset) => shiftDayKey(startKey, offset));
}
