import { dayKeyOf, weekday } from "@repo/timeline";
import type { WorkoutSet } from "@/lib/api/contracts";

const MONTHS = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function partsOf(dayKey: string): [number, number] {
  const [, month, day] = dayKey.split("-").map(Number) as [number, number, number];
  return [day, month];
}

/** "Segunda-feira, 14 de setembro" — ou "Domingo, 13 → segunda, 14 de setembro" quando atravessa a meia-noite. */
export function dateLineOf(startedAt: string, finishedAt?: string): string {
  const startKey = dayKeyOf(startedAt);
  const [startDay, startMonth] = partsOf(startKey);
  const endKey = finishedAt ? dayKeyOf(finishedAt) : startKey;
  if (endKey === startKey) return `${weekday(startKey)}, ${startDay} de ${MONTHS[startMonth - 1]}`;
  const [endDay, endMonth] = partsOf(endKey);
  if (endMonth === startMonth) {
    return `${weekday(startKey).replace("-feira", "")}, ${startDay} → ${weekday(endKey).replace("-feira", "").toLowerCase()}, ${endDay} de ${MONTHS[endMonth - 1]}`;
  }
  return `${startDay} de ${MONTHS[startMonth - 1]} → ${endDay} de ${MONTHS[endMonth - 1]}`;
}

/** "45 min", "1 h", "7 h 30". */
export function formatMinutes(total: number): string {
  const minutes = Math.max(0, Math.round(total));
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return `${Math.floor(minutes / 60)} h${rest ? ` ${rest}` : ""}`;
}

export function minutesBetween(startedAt: string, finishedAt: string): number {
  return Math.max(0, Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 60_000));
}

const decimal = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

export function formatDecimal(value: number): string {
  return decimal.format(value);
}

/** Ritmo em minutos decimais por km: 6.25 → "6′15″/km". */
export function formatPace(minutesPerKm: number): string {
  let minutes = Math.floor(minutesPerKm);
  let seconds = Math.round((minutesPerKm - minutes) * 60);
  if (seconds === 60) { minutes += 1; seconds = 0; }
  return `${minutes}′${String(seconds).padStart(2, "0")}″/km`;
}

/** Agrupa as séries por exercício, mantendo a ordem em que aparecem. */
export function groupSetsByExercise(sets: WorkoutSet[]): Array<{ exercise: string; sets: WorkoutSet[] }> {
  const groups = new Map<string, WorkoutSet[]>();
  for (const set of sets) groups.set(set.exercise, [...(groups.get(set.exercise) ?? []), set]);
  return [...groups].map(([exercise, grouped]) => ({ exercise, sets: grouped }));
}

export function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
