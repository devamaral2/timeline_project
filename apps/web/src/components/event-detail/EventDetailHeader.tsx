"use client";

import type { AgentEventStatus, EventDto, EventPriority, HumanEventStatus } from "@repo/contracts";
import { EventKindMark } from "@/components/events/event-kind-mark";
import { EventPriorityMark, eventPriorityLabels } from "@/components/events/event-priority-mark";
import { EventStatusGlyph, eventStatusName } from "@/components/events/event-status-glyph";
import { humanStatusOptions } from "@/lib/events/event-read-model";
import { EventChoice } from "./EventChoice";
import styles from "./event-detail.module.css";

/** A ordem das prioridades no seletor: da mais alta para a mais baixa. */
const PRIORITY_ORDER: EventPriority[] = ["urgent", "high", "medium", "low"];

interface EventDetailHeaderProps {
  event: EventDto;
  busy: boolean;
  onStatusChange: (status: HumanEventStatus) => void;
  onPriorityChange: (priority: EventPriority) => void;
}

/**
 * O topo do evento: o código do tipo, o título, e o status e a prioridade.
 * Evento de pessoa troca os dois aqui, sem entrar em edição. Evento de agente
 * só mostra: quem executa é o agente, e a API recusa a edição dele.
 */
export function EventDetailHeader({ event, busy, onStatusChange, onPriorityChange }: EventDetailHeaderProps) {
  return (
    <header className={styles.header}>
      <EventKindMark kind={event.kind} />
      <h1 className={styles.title}>{event.name}</h1>
      <div className={styles.chips}>
        {event.actor === "human" ? (
          <HumanStatus event={event} busy={busy} onChange={onStatusChange} />
        ) : event.status ? (
          <span className={styles.chip}>
            <span aria-hidden className={styles.glyph}><EventStatusGlyph actor="agent" status={event.status as AgentEventStatus} size={16} /></span>
            {eventStatusName("agent", event.status as AgentEventStatus)}
          </span>
        ) : null}
        {event.actor === "human" ? (
          <PriorityChoice event={event} busy={busy} onChange={onPriorityChange} />
        ) : (
          <span className={styles.chip}>
            <span aria-hidden className={styles.glyph}><EventPriorityMark priority={event.priority} /></span>
            {eventPriorityLabels[event.priority]}
          </span>
        )}
      </div>
    </header>
  );
}

function HumanStatus({ event, busy, onChange }: { event: EventDto; busy: boolean; onChange: (status: HumanEventStatus) => void }) {
  const status = (event.status ?? null) as HumanEventStatus | null;
  const label = eventStatusName("human", status);
  return (
    <EventChoice<HumanEventStatus>
      value={status}
      ariaLabel={`Status: ${label}. Trocar status de ${event.name}`}
      listLabel="Status do evento"
      disabled={busy}
      options={humanStatusOptions(event).map((value) => ({
        value,
        label: eventStatusName("human", value),
        icon: <EventStatusGlyph actor="human" status={value} size={18} />,
      }))}
      trigger={
        <>
          <span aria-hidden className={styles.glyph}><EventStatusGlyph actor="human" status={status} size={18} /></span>
          {label}
        </>
      }
      onChange={onChange}
    />
  );
}

function PriorityChoice({ event, busy, onChange }: { event: EventDto; busy: boolean; onChange: (priority: EventPriority) => void }) {
  const label = eventPriorityLabels[event.priority];
  return (
    <EventChoice<EventPriority>
      value={event.priority}
      ariaLabel={`Prioridade: ${label}. Trocar prioridade de ${event.name}`}
      listLabel="Prioridade do evento"
      disabled={busy}
      options={PRIORITY_ORDER.map((value) => ({ value, label: eventPriorityLabels[value], icon: <EventPriorityMark priority={value} /> }))}
      trigger={
        <>
          <span aria-hidden className={styles.glyph}><EventPriorityMark priority={event.priority} /></span>
          {label}
        </>
      }
      onChange={onChange}
    />
  );
}
