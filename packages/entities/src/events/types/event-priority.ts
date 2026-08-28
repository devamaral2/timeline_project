/** O peso que o usuario da ao evento. Independente de qualquer outra coisa. */
export const EVENT_PRIORITIES = ["urgent", "normal", "flexible"] as const;

export type EventPriority = (typeof EVENT_PRIORITIES)[number];

export const DEFAULT_EVENT_PRIORITY: EventPriority = "normal";

export function isEventPriority(value: unknown): value is EventPriority {
  return EVENT_PRIORITIES.includes(value as EventPriority);
}
