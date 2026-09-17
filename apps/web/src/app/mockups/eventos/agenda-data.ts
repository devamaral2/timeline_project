import { dayKeyOf, formatTime } from "@repo/timeline";
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
    type: event.primaryItemType,
    time: `${formatTime(event.startedAt)} — ${event.finishedAt ? formatTime(event.finishedAt) : "em andamento"}`,
    minutes,
    duration: event.durationLabel,
    startedAt: event.startedAt,
    finishedAt: event.finishedAt,
    tags: event.tags,
    missed: event.missed,
    running: !event.finishedAt,
    notifyOffsetsMinutes: event.notifyOffsetsMinutes,
  };
}

/** Agrupa e ordena os cartões como a leitura da agenda espera. */
export function agendaEventsByDay(events: readonly TimelineEventCardDto[]): Record<string, ExampleEvent[]> {
  const byDay: Record<string, ExampleEvent[]> = {};
  const seen = new Set<string>();
  for (const event of events) {
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    const dayKey = dayKeyOf(event.startedAt);
    const dayEvents = byDay[dayKey] ?? [];
    dayEvents.push(agendaEventFromCard(event));
    byDay[dayKey] = dayEvents;
  }
  for (const dayEvents of Object.values(byDay)) {
    dayEvents.sort((left, right) => (left.startedAt ?? "").localeCompare(right.startedAt ?? "") || (left.id ?? "").localeCompare(right.id ?? ""));
  }
  return byDay;
}
