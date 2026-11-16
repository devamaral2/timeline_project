"use client";

import { Bot } from "lucide-react";
import type { AgentTaskStatus, TaskDto, TaskPriority, HumanTaskStatus } from "@repo/contracts";
import { EventKindMark } from "@/components/events/event-kind-mark";
import { EventPriorityMark, eventPriorityLabels } from "@/components/events/event-priority-mark";
import { EventStatusGlyph, eventStatusName } from "@/components/events/event-status-glyph";
import { humanStatusOptions } from "@/lib/events/event-read-model";
import { EventChoice } from "./EventChoice";
import styles from "./event-detail.module.css";

/** A ordem das prioridades no seletor: da mais alta para a mais baixa. */
const PRIORITY_ORDER: TaskPriority[] = ["urgent", "high", "medium", "low"];

interface EventDetailHeaderProps {
  event: TaskDto;
  busy: boolean;
  onStatusChange: (status: HumanTaskStatus) => void;
  onPriorityChange: (priority: TaskPriority) => void;
}

/**
 * O topo do evento: o código do tipo, o título, e o status e a prioridade.
 * Evento de pessoa troca os dois aqui, sem entrar em edição. Evento de agente
 * só mostra o status, solto na linha, com o robô na ponta direita; não mostra
 * prioridade: quem executa é o agente, e a API recusa a edição dele. O status
 * fica no começo da linha e a prioridade na ponta direita, sem a moldura da
 * pílula. Evento "Só agenda" (sem status) não mostra nenhum dos dois: é só um
 * compromisso; para virar tarefa, o status entra pela edição.
 */
export function EventDetailHeader({ event, busy, onStatusChange, onPriorityChange }: EventDetailHeaderProps) {
  return (
    <header className={styles.header}>
      <EventKindMark kind={event.kind} />
      <h1 className={styles.title}>{event.name}</h1>
      {event.status == null ? null : (
      <div className={styles.chips}>
        {event.actor === "human" ? (
          <HumanStatus event={event} busy={busy} onChange={onStatusChange} />
        ) : (
          <span className={styles.agentStatus}>
            <span aria-hidden className={styles.glyph}><EventStatusGlyph actor="agent" status={event.status as AgentTaskStatus} size={16} /></span>
            {eventStatusName("agent", event.status as AgentTaskStatus)}
          </span>
        )}
        {event.actor === "human" ? (
          <div className={styles.priority}>
            <PriorityChoice event={event} busy={busy} onChange={onPriorityChange} />
          </div>
        ) : (
          <Bot className={styles.agentMark} size={20} strokeWidth={1.9} aria-hidden="true" data-agent-mark />
        )}
      </div>
      )}
    </header>
  );
}

function HumanStatus({ event, busy, onChange }: { event: TaskDto; busy: boolean; onChange: (status: HumanTaskStatus) => void }) {
  const status = (event.status ?? null) as HumanTaskStatus | null;
  const label = eventStatusName("human", status);
  return (
    <EventChoice<HumanTaskStatus>
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

function PriorityChoice({ event, busy, onChange }: { event: TaskDto; busy: boolean; onChange: (priority: TaskPriority) => void }) {
  const label = eventPriorityLabels[event.priority];
  return (
    <EventChoice<TaskPriority>
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
