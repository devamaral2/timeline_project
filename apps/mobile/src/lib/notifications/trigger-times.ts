/**
 * Sem import de React Native — testado no Vitest com um relogio falso, mesmo
 * padrao de `session-store.ts` em `lib/auth/`.
 */
export function computeTriggerTimes(
  startedAt: Date,
  offsetsMinutes: readonly number[],
  now: Date = new Date(),
): Date[] {
  const nowMs = now.getTime();
  return offsetsMinutes
    .map((offsetMinutes) => new Date(startedAt.getTime() - offsetMinutes * 60_000))
    .filter((triggerAt) => triggerAt.getTime() > nowMs);
}
