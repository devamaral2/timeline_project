/**
 * A natureza do evento. E uma coluna do proprio evento (`events.kind`) e nao
 * depende de ele ter uma note: um evento `meal` pode existir sem nenhuma.
 */
export const EVENT_KINDS = ["routine", "meal", "sleep", "training"] as const;

export type EventKind = (typeof EVENT_KINDS)[number];

export const DEFAULT_EVENT_KIND: EventKind = "routine";

export function isEventKind(value: unknown): value is EventKind {
  return EVENT_KINDS.includes(value as EventKind);
}
