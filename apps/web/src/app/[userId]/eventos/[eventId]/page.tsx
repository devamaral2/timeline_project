"use client";

import { CalendarX, Pencil, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useMotionRouter } from "@/components/shell/navigation-motion";
import {
  ActionPill, BackButton, BackLink, DetailActions, DetailFact, DetailFacts, DetailFrame, DetailMenu, DetailMessage,
  DetailNav, DetailOrigin, DetailSection, LinkList, LinkMessage, MenuItem, Prose, Reminders,
  TagPills, TaskLinkRow, TimeRange, detailIcon,
} from "@/components/detail/detail-parts";
import { EntityAiEditBar } from "@/components/detail/EntityAiEditBar";
import { DeleteEventDialog } from "@/components/events/DeleteEventDialog";
import { EditEventModal } from "@/components/events/EditEventModal";
import { notificationOffsetLabel, priorityLabels, visualForItemType } from "@/components/events/event-visuals";
import { TaskPriorityIcon } from "@/components/agenda/task-controls";
import { authedFetch } from "@/lib/api/authed-fetch";
import { useNow } from "@/lib/events/use-now";
import type { EventDetailDto, TaskDetailDto, WorkItemStatus } from "@/lib/api/contracts";
import { whenLabel } from "@/lib/notes/notes-model";
import { updateTask } from "@/lib/tasks/task-api";
import { taskStatusLabels, taskWhenLabel } from "@/lib/tasks/tasks-model";
import { elapsedSecondsOf, eventPositionOf, formatStopwatch, formatTime } from "@repo/timeline";
import { agendaRefreshEvent } from "@/components/agenda/agenda-refresh";
import { dateLineOf, formatMinutes, minutesBetween } from "@/lib/events/event-detail-format";
import { hasPendingMeal, pendingMealEditMessage } from "@/lib/notes/meal-generation";
import { usePendingMealRefresh } from "@/lib/notes/use-pending-meal-refresh";
import { EventNote, noteTitleOf, statusLabelOf } from "./event-detail-parts";
import styles from "./event-details.module.css";

export default function EventPage({ params }: { params: Promise<{ userId: string; eventId: string }> }) {
  const now = useNow();
  const router = useMotionRouter();
  const [eventId, setEventId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [event, setEvent] = useState<EventDetailDto | null>(null);
  const [tasks, setTasks] = useState<TaskDetailDto[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [savingMissed, setSavingMissed] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const pendingMeal = hasPendingMeal(event?.notes ?? []);
  usePendingMealRefresh(pendingMeal, async () => {
    if (eventId) setEvent(await authedFetch<EventDetailDto>(`/api/events/${eventId}`));
  });

  useEffect(() => {
    let cancelled = false;
    void params.then(({ userId: nextUserId, eventId: nextEventId }) => {
      if (!cancelled) {
        setUserId(nextUserId);
        setEventId(nextEventId);
      }
    });
    return () => { cancelled = true; };
  }, [params]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadKey força o refetch após editar.
  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    setError(false);
    void authedFetch<EventDetailDto>(`/api/events/${eventId}`)
      .then((data) => { if (!cancelled) setEvent(data); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [eventId, reloadKey]);

  const taskIds = event?.taskIds;
  useEffect(() => {
    if (!taskIds?.length) {
      setTasks([]);
      setTasksLoading(false);
      return;
    }
    let cancelled = false;
    setTasks([]);
    setTasksLoading(true);
    void Promise.all(
      taskIds.map((taskId) => authedFetch<TaskDetailDto>(`/api/tasks/${taskId}`).catch(() => null)),
    ).then((loaded) => {
      if (!cancelled) setTasks(loaded.filter((task): task is TaskDetailDto => task !== null));
    }).finally(() => {
      if (!cancelled) setTasksLoading(false);
    });
    return () => { cancelled = true; };
  }, [taskIds]);

  /** Troca o status de uma tarefa vinculada, sem sair do evento; a falha volta o status e avisa. */
  async function updateTaskStatus(task: TaskDetailDto, status: WorkItemStatus) {
    if (savingTaskId) return;
    setMutationError(null);
    setSavingTaskId(task.id);
    setTasks((current) => current.map((item) => (item.id === task.id ? { ...item, status, revision: item.revision + 1 } : item)));
    try {
      await updateTask(task.id, { expectedRevision: task.revision, status });
    } catch {
      setTasks((current) => current.map((item) => (item.id === task.id ? task : item)));
      setMutationError("Não foi possível trocar o status da tarefa. Tente novamente.");
    } finally {
      setSavingTaskId(null);
    }
  }

  async function updateMissed(missed: boolean) {
    if (!event || savingMissed) return;
    const previous = event;
    setMutationError(null);
    setSavingMissed(true);
    setEvent({ ...event, missed, revision: event.revision + 1 });
    try {
      await authedFetch(`/api/events/${event.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedRevision: previous.revision, missed }),
      });
      window.dispatchEvent(new Event(agendaRefreshEvent));
    } catch {
      setEvent(previous);
      setMutationError("Não foi possível atualizar a situação. Tente novamente.");
    } finally {
      setSavingMissed(false);
    }
  }

  const frame = { leadLabel: "Resumo do evento", bodyLabel: "Conteúdo do evento" };
  if (loading) {
    return <DetailFrame {...frame} lead={<DetailNav label="Navegação do registro" back={<BackButton onClick={() => router.back()}>Voltar</BackButton>} />}><DetailMessage>Carregando evento…</DetailMessage></DetailFrame>;
  }
  if (error || !event || !userId) {
    return (
      <DetailFrame {...frame} lead={<DetailNav label="Navegação do registro" back={<BackButton onClick={() => router.back()}>Voltar</BackButton>} />}>
        <DetailMessage alert>Não foi possível carregar o evento. Tente novamente.</DetailMessage>
      </DetailFrame>
    );
  }

  const type = event.kind;
  const visual = visualForItemType(type);
  const TypeIcon = visual.Icon;
  const position = now ? eventPositionOf(event, now) : null;
  const statusLabel = position ? statusLabelOf(position, event.missed) : "Situação do evento";
  const agendaMinutes = event.finishedAt ? minutesBetween(event.startedAt, event.finishedAt) : null;
  const dateLine = dateLineOf(event.startedAt, event.finishedAt);
  const linkedTasks = event.taskIds?.length ?? 0;
  const running = position === "running";
  const elapsedSeconds = running && now ? elapsedSecondsOf(event.startedAt, now) : 0;
  const progress = running && agendaMinutes ? Math.min(100, Math.round((elapsedSeconds / 60 / agendaMinutes) * 100)) : null;
  const blocked = pendingMeal ? pendingMealEditMessage : undefined;
  const edit = () => { if (event.kind === "routine") router.push(`/${userId}/eventos/${event.id}/editar`); else setEditing(true); };
  const refresh = () => { setReloadKey((key) => key + 1); window.dispatchEvent(new Event(agendaRefreshEvent)); };
  const when = now ? `${whenLabel(event.startedAt, now)}${event.finishedAt ? ` — ${formatTime(event.finishedAt)}` : ""}` : null;

  return (
    <DetailFrame
      {...frame}
      type={type}
      lead={
        <>
          <DetailNav label="Navegação do registro" back={<BackLink href={`/${userId}`}>Agenda</BackLink>}>
            <DetailMenu label="Mais ações">
              {(close) => (
                <>
                  <MenuItem icon={<Pencil {...detailIcon} />} disabled={pendingMeal} title={blocked} onClick={() => { close(); edit(); }}>Editar</MenuItem>
                  {position === "past" ? <MenuItem icon={<CalendarX {...detailIcon} />} disabled={savingMissed} onClick={() => { close(); void updateMissed(!event.missed); }}>{event.missed ? "Marcar como realizado" : "Não realizado"}</MenuItem> : null}
                  <MenuItem icon={<Trash2 {...detailIcon} />} danger onClick={() => { close(); setDeleting(true); }}>Excluir</MenuItem>
                </>
              )}
            </DetailMenu>
          </DetailNav>

          <div className={styles.headingBlock}>
            <div className={styles.kindRow}>
              <span className={styles.kindTile} data-live={running || undefined} role="img" aria-label={running ? `${visual.label}, em andamento` : visual.label} title={statusLabel}><TypeIcon {...detailIcon} /></span>
              <p className={styles.kindDate}>{dateLine}</p>
            </div>
            <h1 className={styles.title}>{event.name}</h1>
            {event.missed ? <span className={styles.missed}>Não realizado</span> : null}
          </div>

          <div className={styles.timeBlock}>
            <TimeRange start={formatTime(event.startedAt)} end={event.finishedAt ? formatTime(event.finishedAt) : null} minutes={agendaMinutes} />
            {running ? (
              <div className={styles.live}>
                <p><i aria-hidden /><span role="timer" aria-label="Tempo decorrido">{formatStopwatch(elapsedSeconds)}</span></p>
                {progress !== null && agendaMinutes ? <div className={styles.liveBar} role="img" aria-label={`${Math.floor(elapsedSeconds / 60)} de ${agendaMinutes} minutos decorridos`}><i style={{ width: `${progress}%` }} /></div> : null}
              </div>
            ) : null}
          </div>

          <DetailFacts label="Informações">
            <DetailFact label="Prioridade">
              <span className={styles.priority} data-priority={event.priority}><TaskPriorityIcon priority={event.priority} decorative />{priorityLabels[event.priority]}</span>
            </DetailFact>
            {event.notifyOffsetsMinutes.length ? <DetailFact label={event.notifyOffsetsMinutes.length === 1 ? "Lembrete" : "Lembretes"}><Reminders labels={event.notifyOffsetsMinutes.map(notificationOffsetLabel)} /></DetailFact> : null}
            {event.tags.length ? <DetailFact label="Tags"><TagPills tags={event.tags} label="Tags do evento" /></DetailFact> : null}
          </DetailFacts>

          <DetailActions>
            <ActionPill icon={<Pencil {...detailIcon} />} disabled={pendingMeal} title={blocked} onClick={edit}>Editar</ActionPill>
            {position === "past" ? <ActionPill icon={<CalendarX {...detailIcon} />} pressed={event.missed} disabled={savingMissed} onClick={() => void updateMissed(!event.missed)}>Não realizado</ActionPill> : null}
            <ActionPill icon={<Trash2 {...detailIcon} />} danger onClick={() => setDeleting(true)}>Excluir</ActionPill>
          </DetailActions>
        </>
      }
    >
      {event.description ? <DetailSection title="Descrição" labelId="ev-description"><Prose clamp>{event.description}</Prose></DetailSection> : null}

      {event.interruptions.length ? (
        <DetailSection title="Interrupções" labelId="ev-interruptions" count={event.interruptions.length}>
          <ul className={styles.list}>
            {event.interruptions.map((interruption) => (
              <li key={interruption.id}>
                <div><p>{interruption.name}</p>{interruption.description ? <p className={styles.secondary}>{interruption.description}</p> : null}</div>
                <span>{formatMinutes(minutesBetween(interruption.startedAt, interruption.finishedAt))}</span>
              </li>
            ))}
          </ul>
        </DetailSection>
      ) : null}

      {linkedTasks ? (
        <DetailSection title="Tarefas" labelId="ev-tasks" count={linkedTasks}>
          <LinkList>
            {tasks.length ? tasks.map((task) => (
              <TaskLinkRow
                key={task.id}
                name={task.name}
                status={task.status}
                sub={`Tarefa · ${now ? lowerFirst(taskWhenLabel(task, now)) : taskStatusLabels[task.status].toLowerCase()}`}
                href={`/${userId}/tarefas/${task.id}`}
                busy={savingTaskId === task.id}
                onStatusChange={(status) => void updateTaskStatus(task, status)}
              />
            )) : <LinkMessage>{tasksLoading ? "Carregando tarefas…" : "Não foi possível carregar as tarefas vinculadas."}</LinkMessage>}
          </LinkList>
        </DetailSection>
      ) : null}

      {event.notes.length ? (
        <DetailSection title="Notas" labelId="ev-notes" count={event.notes.length}>
          <div className={styles.notes}>
            {event.notes.map((note) => (
              <EventNote
                key={note.id}
                note={note}
                title={noteTitleOf(note, event.name, dateLine)}
                updated={now ? whenLabel(note.updatedAt, now) : undefined}
                href={`/${userId}/notas/${note.id}`}
                agendaMinutes={agendaMinutes}
              />
            ))}
          </div>
        </DetailSection>
      ) : null}

      <DetailOrigin id="event" />

      {mutationError ? <DetailMessage alert>{mutationError}</DetailMessage> : null}

      <EntityAiEditBar
        userId={userId}
        entityType="event"
        entityId={event.id}
        onEdited={refresh}
        context={{ icon: <TypeIcon aria-hidden />, meta: when ? `Evento · ${when}` : "Evento", title: event.name }}
      />

      {editing ? <EditEventModal eventId={event.id} onClose={() => setEditing(false)} onUpdated={() => { setEditing(false); refresh(); }} /> : null}
      {deleting ? <DeleteEventDialog eventId={event.id} eventName={event.name} onClose={() => setDeleting(false)} onDeleted={() => { window.dispatchEvent(new Event(agendaRefreshEvent)); router.push(`/${userId}`); }} /> : null}
    </DetailFrame>
  );
}

/** "Hoje, 09:00" → "hoje, 09:00": o rótulo da lista, em minúsculas, para ir depois de "Tarefa ·". */
function lowerFirst(label: string): string {
  return label.charAt(0).toLocaleLowerCase("pt-BR") + label.slice(1);
}
