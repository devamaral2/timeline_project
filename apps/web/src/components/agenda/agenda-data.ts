import { eventDayKeysOf, formatTime } from "@repo/timeline";
import type { TimelineEventCardDto } from "@/lib/api/contracts";
import type { ExampleEvent } from "./agenda-examples";

/** Converte o contrato HTTP para o modelo visual compartilhado pela agenda. */
export function agendaEventFromCard(event: TimelineEventCardDto): ExampleEvent {
  const started = new Date(event.startedAt);
  const finished = event.finishedAt ? new Date(event.finishedAt) : undefined;
  const minutes = finished
    ? Math.max(0, Math.round((finished.getTime() - started.getTime()) / 60_000))
    : 0;

  return {
    id: event.id,
    name: event.name,
    type: event.kind,
    time: event.finishedAt ? `${formatTime(event.startedAt)} — ${formatTime(event.finishedAt)}` : formatTime(event.startedAt),
    minutes,
    duration: event.durationLabel,
    startedAt: event.startedAt,
    finishedAt: event.finishedAt,
    tags: event.tags,
    missed: event.missed,
    notifyOffsetsMinutes: event.notifyOffsetsMinutes,
  };
}

/** Agrupa e ordena os cartões como a leitura da agenda espera; o evento que atravessa a meia-noite aparece no dia em que começou e no dia em que terminou. */
export function agendaEventsByDay(events: readonly TimelineEventCardDto[]): Record<string, ExampleEvent[]> {
  const byDay: Record<string, ExampleEvent[]> = {};
  const seen = new Set<string>();
  for (const event of events) {
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    const agendaEvent = agendaEventFromCard(event);
    for (const dayKey of eventDayKeysOf(event.startedAt, event.finishedAt)) {
      const dayEvents = byDay[dayKey] ?? [];
      dayEvents.push(agendaEvent);
      byDay[dayKey] = dayEvents;
    }
  }
  for (const dayEvents of Object.values(byDay)) {
    dayEvents.sort((left, right) => (left.startedAt ?? "").localeCompare(right.startedAt ?? "") || (left.id ?? "").localeCompare(right.id ?? ""));
  }
  return byDay;
}
