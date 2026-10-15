import type { TimelineEventCardDto } from "@repo/contracts";
import { eventDayKeysOf } from "./event-days";
import type { TimelineDay } from "./timeline-day";

/**
 * Agrupa os eventos pelos dias civis que ocupam no fuso da timeline: um evento
 * que atravessa a meia-noite aparece no dia em que comecou e no dia em que
 * terminou. Dias e eventos saem em ordem decrescente e ids repetidos sao
 * descartados, porque janelas vizinhas podem se sobrepor.
 */
export function groupEventsByDay(
  events: readonly TimelineEventCardDto[],
  todayKey: string,
): TimelineDay[] {
  const uniqueEvents = new Map<string, TimelineEventCardDto>();
  for (const event of events) {
    if (!uniqueEvents.has(event.id)) uniqueEvents.set(event.id, event);
  }

  const eventsByDay = new Map<string, TimelineEventCardDto[]>();
  for (const event of uniqueEvents.values()) {
    for (const key of eventDayKeysOf(event.startedAt, event.finishedAt)) {
      const bucket = eventsByDay.get(key);
      if (bucket) bucket.push(event);
      else eventsByDay.set(key, [event]);
    }
  }

  return [...eventsByDay.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([dayKey, dayEvents]) => ({
      dayKey,
      isToday: dayKey === todayKey,
      events: dayEvents.sort((left, right) => right.startedAt.localeCompare(left.startedAt)),
    }));
}
