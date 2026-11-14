"use client";

import type { EventDto } from "@repo/contracts";
import { DetailFact, DetailFacts, DetailSection, Prose, Reminders, TagPills } from "@/components/detail/detail-parts";
import { cardDurationLabel } from "@/lib/events/card-text";
import { momentLabel, recurrenceLines, reminderLabel } from "@/lib/events/event-read-model";
import styles from "./event-detail.module.css";

/**
 * A seção "Informações" da leitura: início, fim planejado com a duração,
 * tarefa persistente, recorrência, lembretes, tags e descrição, em texto.
 * Localização, horário padrão, "Gerado por" e Registro não entram: o contrato
 * do evento não traz esses dados (ver a tabela de lacunas da spec).
 */
export function EventInfoSection({ event }: { event: EventDto }) {
  const longRunning = event.longRunning;
  const duration = cardDurationLabel(event);
  const reminders = event.notifyOffsetsMinutes.map(reminderLabel);
  const recurrence = event.recurrence ? recurrenceLines(event.recurrence) : null;

  return (
    <DetailSection title="Informações" labelId="event-info">
      <DetailFacts label="Informações">
        {event.startedAt || !longRunning ? (
          <DetailFact label="Início">{event.startedAt ? momentLabel(event.startedAt) : "sem data"}</DetailFact>
        ) : null}
        <DetailFact label={longRunning ? "Previsão de entrega" : "Término"}>
          <span className={styles.value}>{event.estimatedFinishAt ? momentLabel(event.estimatedFinishAt) : "sem data"}</span>
          {duration ? <span className={styles.duration}>{duration}</span> : null}
        </DetailFact>
        <DetailFact label="Tarefa persistente">{longRunning ? "Sim" : "Não"}</DetailFact>
        {recurrence ? (
          <DetailFact label="Recorrência">
            <span className={styles.stack}>
              <span className={styles.value}>{recurrence.rule}</span>
              <span className={styles.sub}>{recurrence.detail}</span>
            </span>
          </DetailFact>
        ) : null}
        {reminders.length ? (
          <DetailFact label="Lembrar antes de"><Reminders labels={reminders} /></DetailFact>
        ) : null}
        {event.tags.length ? (
          <DetailFact label="Tags"><TagPills tags={event.tags} label="Tags do evento" /></DetailFact>
        ) : null}
      </DetailFacts>
      {event.description ? (
        <div className={styles.description}>
          <h3 className={styles.factLabel}>Descrição</h3>
          <Prose clamp>{event.description}</Prose>
        </div>
      ) : null}
    </DetailSection>
  );
}
