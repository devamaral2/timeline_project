import { dayKeyOf, shiftDayKey } from "./format-date";

/**
 * Os dias civis (no fuso da timeline) em que o evento aparece: do dia em que
 * comecou ate o dia em que terminou. Evento sem hora de fim, ou que termina no
 * mesmo dia, aparece so no dia de inicio.
 *
 * Um fim exatamente a meia-noite ainda pertence ao dia anterior: o evento das
 * 22:00 as 00:00 nao ocorre no dia seguinte.
 */
export function eventDayKeysOf(startedAt: string, finishedAt?: string | null): string[] {
  const startKey = dayKeyOf(startedAt);
  if (!finishedAt) return [startKey];

  const finishedMs = new Date(finishedAt).getTime();
  if (!(finishedMs > new Date(startedAt).getTime())) return [startKey];

  const endKey = dayKeyOf(new Date(finishedMs - 1));
  const keys = [startKey];
  for (let key = startKey; key < endKey; ) {
    key = shiftDayKey(key, 1);
    keys.push(key);
  }
  return keys;
}
