/**
 * Minutos antes de `startedAt` em que um evento ou tarefa pode avisar o
 * usuario. Numero livre — o usuario escolhe minutos ou dias na interface, e
 * os dois convertem para minutos antes de chegar aqui.
 *
 * O teto existe so para barrar valor absurdo (dedo errado no teclado), nao
 * porque o dominio pede um limite exato.
 */
export const MIN_NOTIFICATION_OFFSET_MINUTES = 1;
/** 30 dias. */
export const MAX_NOTIFICATION_OFFSET_MINUTES = 43_200;

export type NotificationOffsetMinutes = number;

export function isNotificationOffsetMinutes(value: unknown): value is NotificationOffsetMinutes {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_NOTIFICATION_OFFSET_MINUTES &&
    value <= MAX_NOTIFICATION_OFFSET_MINUTES
  );
}

/** So `Event.create` usa isto — evento novo nasce com aviso de 5 minutos antes. */
export const DEFAULT_EVENT_NOTIFICATION_OFFSETS_MINUTES: NotificationOffsetMinutes[] = [5];
