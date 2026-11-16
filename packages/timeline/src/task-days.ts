import { dayKeyOf, shiftDayKey } from "./format-date";

/**
 * Os dias civis (no fuso da agenda) em que a tarefa aparece: do dia em que
 * comecou ate o dia em que terminou. Tarefa sem hora de fim, ou que termina no
 * mesmo dia, aparece so no dia de inicio.
 *
 * Um fim exatamente a meia-noite ainda pertence ao dia anterior: a tarefa das
 * 22:00 as 00:00 nao ocorre no dia seguinte.
 */
export function taskDayKeysOf(startedAt: string, estimatedFinishAt?: string | null): string[] {
  const startKey = dayKeyOf(startedAt);
  if (!estimatedFinishAt) return [startKey];

  const finishMs = new Date(estimatedFinishAt).getTime();
  if (!(finishMs > new Date(startedAt).getTime())) return [startKey];

  const endKey = dayKeyOf(new Date(finishMs - 1));
  const keys = [startKey];
  for (let key = startKey; key < endKey; ) {
    key = shiftDayKey(key, 1);
    keys.push(key);
  }
  return keys;
}
