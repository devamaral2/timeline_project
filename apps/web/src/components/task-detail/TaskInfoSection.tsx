"use client";

import type { TaskDto } from "@repo/contracts";
import { MapPin } from "lucide-react";
import { ProjectLine } from "@/components/projects/project-line";
import { DetailFact, DetailFacts, DetailSection, Prose, Reminders, TagPills } from "@/components/detail/detail-parts";
import { cardDurationLabel } from "@/lib/tasks/card-text";
import { mapsUrl } from "@/lib/tasks/maps-link";
import { momentLabel, recurrenceLines, reminderLabel } from "@/lib/tasks/task-read-model";
import styles from "./task-detail.module.css";

/**
 * A seção "Informações" da leitura: início, fim planejado com a duração,
 * tarefa persistente, recorrência, lembretes, tags e descrição, em texto.
 * O local abre no Google Maps. Horário padrão, "Gerado por" e Registro não entram: o contrato
 * da tarefa não traz esses dados (ver a tabela de lacunas da spec).
 */
export function TaskInfoSection({ task }: { task: TaskDto }) {
  const longRunning = task.longRunning;
  const duration = cardDurationLabel(task);
  const reminders = task.notifyOffsetsMinutes.map(reminderLabel);
  const recurrence = task.recurrence ? recurrenceLines(task.recurrence) : null;

  return (
    <DetailSection title="Informações" labelId="task-info">
      <DetailFacts label="Informações">
        {/* Só leitura: o projeto da tarefa troca pela edição. */}
        <DetailFact label="Projeto"><ProjectLine project={task.project} /></DetailFact>
        {task.startedAt || !longRunning ? (
          <DetailFact label="Início">{task.startedAt ? momentLabel(task.startedAt) : "sem data"}</DetailFact>
        ) : null}
        <DetailFact label={longRunning ? "Previsão de entrega" : "Término"}>
          <span className={styles.value}>{task.estimatedFinishAt ? momentLabel(task.estimatedFinishAt) : "sem data"}</span>
          {duration ? <span className={styles.duration}>{duration}</span> : null}
        </DetailFact>
        {longRunning ? (
          <DetailFact label="Tarefa persistente">
            {/* O ponto verde basta: só a tarefa persistente chega aqui. */}
            <span className={styles.persistent} role="img" aria-label="Sim" />
          </DetailFact>
        ) : null}
        {recurrence ? (
          <DetailFact label="Recorrência">
            <span className={styles.stack}>
              <span className={styles.value}>{recurrence.rule}</span>
              <span className={styles.sub}>{recurrence.detail}</span>
            </span>
          </DetailFact>
        ) : null}
        {task.location ? (
          <DetailFact label="Local">
            <a className={styles.mapsLink} href={mapsUrl(task.location)} target="_blank" rel="noopener noreferrer">
              <MapPin className={styles.mapsIcon} aria-hidden />
              <span>{task.location}</span>
              <span className={styles.srOnly}> (abre no Google Maps)</span>
            </a>
          </DetailFact>
        ) : null}
        {reminders.length ? (
          <DetailFact label="Lembrar antes de"><Reminders labels={reminders} /></DetailFact>
        ) : null}
        {task.tags.length ? (
          <DetailFact label="Tags"><TagPills tags={task.tags} label="Tags da tarefa" /></DetailFact>
        ) : null}
      </DetailFacts>
      {task.description ? (
        <div className={styles.description}>
          <h3 className={styles.factLabel}>Descrição</h3>
          <Prose clamp>{task.description}</Prose>
        </div>
      ) : null}
    </DetailSection>
  );
}
