/**
 * Lembretes e tags do formulário de edição, como listas puras. O lembrete é um
 * número de minutos antes do evento (a API aceita de 1 a 43200, que são 30
 * dias); a tag é o texto como a API guarda: sem espaços nas pontas e em
 * minúsculas.
 */

export const MINUTES_PER_DAY = 1440;
export const REMINDER_MIN_MINUTES = 1;
export const REMINDER_MAX_MINUTES = 43200;

export type ReminderUnit = "minutes" | "days";

/** Os minutos de um lembrete digitado em minutos ou dias; `null` fora de 1 minuto a 30 dias. */
export function reminderMinutes(amount: number, unit: ReminderUnit): number | null {
  if (!Number.isInteger(amount)) return null;
  const minutes = unit === "days" ? amount * MINUTES_PER_DAY : amount;
  return minutes >= REMINDER_MIN_MINUTES && minutes <= REMINDER_MAX_MINUTES ? minutes : null;
}

/** "30 min", "1 dia", "2 dias": dias quando o lembrete é um número exato de dias. */
export function reminderLabel(minutes: number): string {
  if (minutes % MINUTES_PER_DAY === 0) {
    const days = minutes / MINUTES_PER_DAY;
    return days === 1 ? "1 dia" : `${days} dias`;
  }
  return `${minutes} min`;
}

/** A lista em ordem crescente, sem repetir. */
export function addReminder(reminders: readonly number[], minutes: number): number[] {
  if (reminders.includes(minutes)) return sortReminders(reminders);
  return sortReminders([...reminders, minutes]);
}

export function removeReminder(reminders: readonly number[], minutes: number): number[] {
  return reminders.filter((current) => current !== minutes);
}

export function sortReminders(reminders: readonly number[]): number[] {
  return [...reminders].sort((a, b) => a - b);
}

/** A tag como a API a guarda: sem espaços nas pontas e em minúsculas. Vazia quando sobra só espaço. */
export function normalizeTag(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Acrescenta a tag normalizada, se ainda não estiver na lista e não for vazia. */
export function addTag(tags: readonly string[], raw: string): string[] {
  const name = normalizeTag(raw);
  if (!name || tags.includes(name)) return [...tags];
  return [...tags, name];
}

export function removeTag(tags: readonly string[], tag: string): string[] {
  return tags.filter((current) => current !== tag);
}

/** Duas listas iguais em conteúdo e em ordem. */
export function sameList<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
