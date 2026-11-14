import type { EventCardDto } from "@repo/contracts";
import { eventDayKeysOf, formatTime } from "@repo/timeline";
import { cardDurationLabel } from "@/lib/events/card-text";
import type { ExampleEvent } from "./agenda-examples";

/** Um cartão que tem horário e entra na grade: evento longo e passo ficam de fora mesmo quando a resposta os traz. */
export type AgendaCard = EventCardDto & { startedAt: string };

export function isAgendaCard(card: EventCardDto): card is AgendaCard {
  return card.startedAt !== undefined && !card.longRunning && card.kind !== "step";
}

/**
 * Converte o cartão do contrato para o modelo que a grade usa para ordenar o
 * dia e calcular o tempo livre. A grade fecha no fim planejado
 * (`estimatedFinishAt`): a conclusão real (`finishedAt`) não move a agenda. O
 * cartão vai junto, e é ele que a linha única desenha.
 */
export function agendaEventFromCard(card: AgendaCard): ExampleEvent {
  const started = new Date(card.startedAt).getTime();
  const planned = card.estimatedFinishAt ? new Date(card.estimatedFinishAt).getTime() : started;
  const minutes = Math.max(0, Math.round((planned - started) / 60_000));

  return {
    id: card.id,
    name: card.name,
    type: card.kind,
    time: card.estimatedFinishAt ? `${formatTime(card.startedAt)} — ${formatTime(card.estimatedFinishAt)}` : formatTime(card.startedAt),
    minutes,
    duration: cardDurationLabel(card) ?? "",
    startedAt: card.startedAt,
    finishedAt: card.estimatedFinishAt,
    tags: card.tags,
    card,
  };
}

/** Agrupa e ordena os cartões por horário; o evento que atravessa a meia-noite aparece no dia em que começou e no dia em que termina. */
export function agendaEventsByDay(cards: readonly EventCardDto[]): Record<string, ExampleEvent[]> {
  const byDay: Record<string, ExampleEvent[]> = {};
  const seen = new Set<string>();
  for (const card of cards) {
    if (seen.has(card.id) || !isAgendaCard(card)) continue;
    seen.add(card.id);
    const agendaEvent = agendaEventFromCard(card);
    for (const dayKey of eventDayKeysOf(card.startedAt, card.estimatedFinishAt)) {
      const dayEvents = byDay[dayKey] ?? [];
      dayEvents.push(agendaEvent);
      byDay[dayKey] = dayEvents;
    }
  }
  for (const dayEvents of Object.values(byDay)) {
    dayEvents.sort((left, right) => Date.parse(left.startedAt ?? "") - Date.parse(right.startedAt ?? "") || (left.id ?? "").localeCompare(right.id ?? ""));
  }
  return byDay;
}
