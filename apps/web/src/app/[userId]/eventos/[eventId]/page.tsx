"use client";

import { Bell, Clock3, FileText, Pencil, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BackButton, BackLink, DetailHead, DetailMenu, DetailMessage, DetailOrigin, DetailScreen, DetailSection,
  DetailTitle, DetailTopBar, KindRow, LinkGroup, LinkMessage, LinkRow, MenuItem, MetaList, MetaRow, Prose,
  TagPills, TaskLinkRow, detailIcon,
} from "@/components/detail/detail-parts";
import { EntityAiEditBar } from "@/components/detail/EntityAiEditBar";
import { DeleteEventDialog } from "@/components/events/DeleteEventDialog";
import { EditEventModal } from "@/components/events/EditEventModal";
import { notificationOffsetLabel, visualForItemType } from "@/components/events/event-visuals";
import { authedFetch } from "@/lib/api/authed-fetch";
import { useNow } from "@/lib/events/use-now";
import type { EventDetailDto, TaskDetailDto, WorkItemStatus } from "@/lib/api/contracts";
import { noteSnippet } from "@/lib/notes/notes-model";
import { updateTask } from "@/lib/tasks/task-api";
import { taskStatusLabels, taskWhenLabel } from "@/lib/tasks/tasks-model";
import { elapsedSecondsOf, eventPositionOf, formatStopwatch, formatTime } from "@repo/timeline";
import { agendaRefreshEvent } from "@/components/agenda/agenda-refresh";
import shellStyles from "@/components/shell/shell.module.css";
import { dateLineOf, formatMinutes, minutesBetween, pluralize } from "@/lib/events/event-detail-format";
import { Collapsible } from "@/components/notes/NoteBody";
import { hasPendingMeal, pendingMealEditMessage } from "@/lib/notes/meal-generation";
import { usePendingMealRefresh } from "@/lib/notes/use-pending-meal-refresh";
import { NoteContent, StatusIcon, noteTitleOf, statusLabelOf } from "./event-detail-parts";
import styles from "./event-details.module.css";

export default function EventPage({ params }: { params: Promise<{ userId: string; eventId: string }> }) {
  const now = useNow();
  const router = useRouter();
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

  if (loading) return <main id="conteudo" className={shellStyles.detailMain}><DetailMessage>Carregando evento…</DetailMessage></main>;
  if (error || !event || !userId) return (
    <main id="conteudo" className={shellStyles.detailMain}>
      <DetailScreen>
        <DetailTopBar label="Evento" back={<BackButton onClick={() => router.back()}>Voltar</BackButton>} />
        <DetailMessage alert>Não foi possível carregar o evento. Tente novamente.</DetailMessage>
      </DetailScreen>
    </main>
  );

  const type = event.kind;
  const visual = visualForItemType(type);
  const TypeIcon = visual.Icon;
  const position = now ? eventPositionOf(event, now) : null;
  const statusLabel = position ? statusLabelOf(position, event.missed) : "Situação do evento";
  const agendaMinutes = event.finishedAt ? minutesBetween(event.startedAt, event.finishedAt) : null;
  const dateLine = dateLineOf(event.startedAt, event.finishedAt);
  const endLabel = event.finishedAt
    ? formatTime(event.finishedAt)
    : position === "running" ? "em andamento" : "sem hora de fim";
  const durationLabel =
    position === "running" && now
      ? formatStopwatch(elapsedSecondsOf(event.startedAt, now))
      : agendaMinutes !== null ? formatMinutes(agendaMinutes) : null;
  const linkedTasks = event.taskIds?.length ?? 0;
  const richNotes = event.notes.filter((note) => note.type !== "text");
  const hasLinks = event.notes.length > 0 || linkedTasks > 0;

  return (
    <main id="conteudo" className={shellStyles.detailMain}>
      <DetailScreen type={type}>
        <DetailTopBar label="Evento" back={<BackLink href={`/${userId}`}>Agenda</BackLink>}>
          <DetailMenu label="Mais ações">
            {(close) => (
              <>
                <MenuItem icon={<Pencil {...detailIcon} />} disabled={pendingMeal} title={pendingMeal ? pendingMealEditMessage : undefined} onClick={() => { close(); if (event.kind === "routine") router.push(`/${userId}/eventos/${event.id}/editar`); else setEditing(true); }}>Editar</MenuItem>
                <MenuItem icon={<Trash2 {...detailIcon} />} danger onClick={() => { close(); setDeleting(true); }}>Excluir</MenuItem>
              </>
            )}
          </DetailMenu>
        </DetailTopBar>

        <DetailHead>
          <KindRow
            icon={<TypeIcon {...detailIcon} />}
            label={visual.label === "Evento" ? "Evento" : `Evento · ${visual.label}`}
            trailing={position === "past" ? (
              <button type="button" className={styles.status} aria-pressed={event.missed} disabled={savingMissed}
                aria-label={`Situação: ${statusLabel}. Toque para marcar como ${event.missed ? "aconteceu" : "não realizado"}`} title={statusLabel}
                onClick={() => void updateMissed(!event.missed)}><StatusIcon position={position} missed={event.missed} /></button>
            ) : position === "running" ? (
              <span className={styles.status} role="img" aria-label={`Situação: ${statusLabel}`} title={statusLabel}><StatusIcon position={position} missed={event.missed} /></span>
            ) : <span className={styles.status} aria-hidden="true" />}
          />
          <DetailTitle>{event.name}</DetailTitle>
          <TagPills tags={event.tags} label="Tags do evento" />
        </DetailHead>

        <MetaList label="Informações">
          <MetaRow
            icon={<Clock3 {...detailIcon} />}
            main={dateLine}
            sub={
              <>
                <time dateTime={event.startedAt}>{formatTime(event.startedAt)}</time> → {event.finishedAt ? <time dateTime={event.finishedAt}>{endLabel}</time> : endLabel}
                {durationLabel ? <> · {durationLabel}</> : null}
              </>
            }
          />
          {event.notifyOffsetsMinutes.length ? (
            <MetaRow icon={<Bell {...detailIcon} />} main={event.notifyOffsetsMinutes.map(notificationOffsetLabel).join(" · ")} />
          ) : null}
        </MetaList>

        {event.description ? <Prose clamp>{event.description}</Prose> : null}

        {richNotes.map((note) => <NoteContent key={note.id} note={note} title={noteTitleOf(note, event.name, dateLine)} agendaMinutes={agendaMinutes} />)}

        {event.interruptions.length ? (
          <section className={styles.collapsibles} aria-label="Mais detalhes">
            <Collapsible title="Interrupções" summary={pluralize(event.interruptions.length, "interrupção", "interrupções")}>
              <ul className={styles.list}>
                {event.interruptions.map((interruption) => (
                  <li key={interruption.id}>
                    <div><p>{interruption.name}</p>{interruption.description ? <p className={styles.secondary}>{interruption.description}</p> : null}</div>
                    <span>{formatMinutes(minutesBetween(interruption.startedAt, interruption.finishedAt))}</span>
                  </li>
                ))}
              </ul>
            </Collapsible>
          </section>
        ) : null}

        {hasLinks ? (
          <DetailSection title="Vínculos" labelId="ev-links" className="links">
            {event.notes.length ? (
              <LinkGroup id="ev-links-notes" title="Notas vinculadas" count={event.notes.length}>
                {event.notes.map((note) => (
                  <LinkRow key={note.id} kind="note" icon={<FileText {...detailIcon} />} title={noteTitleOf(note, event.name, dateLine)} sub={`Nota${noteSnippet(note) ? ` · ${noteSnippet(note)}` : ""}`} href={`/${userId}/notas/${note.id}`} />
                ))}
              </LinkGroup>
            ) : null}
            {linkedTasks ? (
              <LinkGroup id="ev-links-tasks" title="Tarefas vinculadas" count={linkedTasks}>
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
              </LinkGroup>
            ) : null}
          </DetailSection>
        ) : null}

        <DetailOrigin id="event" />

        {mutationError ? <DetailMessage alert>{mutationError}</DetailMessage> : null}
      </DetailScreen>

      {userId ? (
        <EntityAiEditBar
          userId={userId}
          entityType="event"
          entityId={event.id}
          onEdited={() => { setReloadKey((key) => key + 1); window.dispatchEvent(new Event(agendaRefreshEvent)); }}
        />
      ) : null}

      {editing ? <EditEventModal eventId={event.id} onClose={() => setEditing(false)} onUpdated={() => { setEditing(false); setReloadKey((key) => key + 1); window.dispatchEvent(new Event(agendaRefreshEvent)); }} /> : null}
      {deleting ? <DeleteEventDialog eventId={event.id} eventName={event.name} onClose={() => setDeleting(false)} onDeleted={() => { window.dispatchEvent(new Event(agendaRefreshEvent)); router.push(`/${userId}`); }} /> : null}
    </main>
  );
}

/** "Hoje, 09:00" → "hoje, 09:00": o rótulo da lista, em minúsculas, para ir depois de "Tarefa ·". */
function lowerFirst(label: string): string {
  return label.charAt(0).toLocaleLowerCase("pt-BR") + label.slice(1);
}
