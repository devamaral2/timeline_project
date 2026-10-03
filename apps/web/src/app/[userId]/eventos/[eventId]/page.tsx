"use client";

import { ArrowLeft, Bell, Ellipsis, Pencil, Tag, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DeleteEventDialog } from "@/components/events/DeleteEventDialog";
import { EditEventModal } from "@/components/events/EditEventModal";
import { ICON_STROKE_WIDTH, notificationOffsetLabel, visualForItemType } from "@/components/events/event-visuals";
import { authedFetch } from "@/lib/api/authed-fetch";
import { useNow } from "@/lib/events/use-now";
import type { EventDetailDto, TaskDetailDto } from "@/lib/api/contracts";
import { tagColorStyle } from "@/lib/tags/tag-color";
import { elapsedSecondsOf, eventPositionOf, formatStopwatch, formatTime } from "@repo/timeline";
import { agendaRefreshEvent } from "../../../mockups/eventos/agenda-refresh";
import shellStyles from "../../../mockups/eventos/mockup.module.css";
import { dateLineOf, formatMinutes, minutesBetween, pluralize } from "./event-detail-format";
import { Collapsible, NoteCard, StatusIcon, statusLabelOf } from "./event-detail-parts";
import styles from "./event-details.module.css";

const icon = { "aria-hidden": true, strokeWidth: ICON_STROKE_WIDTH } as const;
const DESCRIPTION_CLAMP = 180;
const taskStatusLabels: Record<TaskDetailDto["status"], string> = {
  inHold: "Em espera",
  todo: "A fazer",
  inProgress: "Em andamento",
  done: "Concluída",
  cancel: "Cancelada",
};

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
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!menuOpen) return;
    function close(pointer: Event) {
      if (pointer instanceof KeyboardEvent ? pointer.key === "Escape" : !menuRef.current?.contains(pointer.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [menuOpen]);

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

  if (loading) return <main id="conteudo" className={shellStyles.detailMain}><p role="status" className={styles.message}>Carregando evento…</p></main>;
  if (error || !event || !userId) return (
    <main id="conteudo" className={shellStyles.detailMain}>
      <button type="button" className={styles.backLink} onClick={() => router.back()}><ArrowLeft {...icon} />Voltar</button>
      <p role="alert" className={styles.message}>Não foi possível carregar o evento. Tente novamente.</p>
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
    const longDescription = event.description.length > DESCRIPTION_CLAMP || event.description.split("\n").length > 3;
  const linkedTasks = event.taskIds?.length ?? 0;

  return (
    <main id="conteudo" className={shellStyles.detailMain}>
      <div className={styles.content} data-type={type}>
        <nav className={styles.navigation} aria-label="Evento">
          <a href={`/${userId}`} className={styles.backLink}><ArrowLeft {...icon} />Agenda</a>
          <div className={styles.actions}>
            <button type="button" className={styles.editButton} aria-label="Editar evento" onClick={() => setEditing(true)}><Pencil {...icon} /><span>Editar</span></button>
            <div className={styles.menuAnchor} ref={menuRef}>
              <button type="button" className={styles.iconButton} aria-label="Mais ações" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}><Ellipsis {...icon} /></button>
              {menuOpen ? (
                <div role="menu" className={styles.menu}>
                  <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setDeleting(true); }}><Trash2 {...icon} />Excluir</button>
                </div>
              ) : null}
            </div>
          </div>
        </nav>

        <header className={styles.heading}>
          <div className={styles.kindRow}>
            <span className={styles.type}><TypeIcon {...icon} />{visual.label}</span>
            {position === "past" ? (
              <button type="button" className={styles.status} aria-pressed={event.missed} disabled={savingMissed}
                aria-label={`Situação: ${statusLabel}. Toque para marcar como ${event.missed ? "aconteceu" : "não realizado"}`} title={statusLabel}
                onClick={() => void updateMissed(!event.missed)}><StatusIcon position={position} missed={event.missed} /></button>
            ) : position ? (
              <span className={styles.status} role="img" aria-label={`Situação: ${statusLabel}`} title={statusLabel}><StatusIcon position={position} missed={event.missed} /></span>
            ) : (
              <span className={styles.status} aria-hidden="true" />
            )}
          </div>
          <h1>{event.name}</h1>
          <p className={styles.date}>{dateLine}</p>
          <p className={styles.date}>
            <span className={styles.window}><time dateTime={event.startedAt}>{formatTime(event.startedAt)}</time> → {event.finishedAt ? <time dateTime={event.finishedAt}>{endLabel}</time> : endLabel}</span>
            {durationLabel ? <> · {durationLabel}</> : null}
          </p>
        </header>

        {event.notifyOffsetsMinutes.length || event.tags.length ? (
          <section className={styles.info} aria-label="Informações">
            {event.notifyOffsetsMinutes.length ? (
              <div><Bell {...icon} /><div>{event.notifyOffsetsMinutes.map((minutes) => <span key={minutes}>{notificationOffsetLabel(minutes)}</span>)}</div></div>
            ) : null}
            {event.tags.length ? (
              <div><Tag {...icon} /><ul aria-label="Tags do evento">{event.tags.map((tag) => <li key={tag} style={tagColorStyle(tag)}>#{tag}</li>)}</ul></div>
            ) : null}
          </section>
        ) : null}

        {event.description ? (
          <div className={styles.descriptionBlock}>
            <p className={styles.description} data-clamped={longDescription && !descriptionOpen}>{event.description}</p>
            {longDescription ? <button type="button" className={styles.readMore} aria-expanded={descriptionOpen} onClick={() => setDescriptionOpen((open) => !open)}>{descriptionOpen ? "Ler menos" : "Ler mais"}</button> : null}
          </div>
        ) : null}

        {event.notes.map((note) => <NoteCard key={note.id} note={note} eventName={event.name} dateTitle={dateLine} agendaMinutes={agendaMinutes} />)}

        {event.interruptions.length || linkedTasks ? (
          <section className={styles.collapsibles} aria-label="Mais detalhes">
            {event.interruptions.length ? (
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
            ) : null}
            {linkedTasks ? (
              <Collapsible title="Tarefas vinculadas" summary={pluralize(linkedTasks, "tarefa", "tarefas")}>
                <ul className={styles.list}>
                  {tasks.length ? tasks.map((task) => (
                    <li key={task.id}><p>{task.name}</p><span>{taskStatusLabels[task.status]}</span></li>
                  )) : (
                    <li><p>{tasksLoading ? "Carregando tarefas…" : "Não foi possível carregar as tarefas vinculadas."}</p></li>
                  )}
                </ul>
              </Collapsible>
            ) : null}
          </section>
        ) : null}

        {mutationError ? <p role="alert" className={styles.message}>{mutationError}</p> : null}
      </div>

      {editing ? <EditEventModal eventId={event.id} onClose={() => setEditing(false)} onUpdated={() => { setEditing(false); setReloadKey((key) => key + 1); window.dispatchEvent(new Event(agendaRefreshEvent)); }} /> : null}
      {deleting ? <DeleteEventDialog eventId={event.id} eventName={event.name} onClose={() => setDeleting(false)} onDeleted={() => { window.dispatchEvent(new Event(agendaRefreshEvent)); router.push(`/${userId}`); }} /> : null}
    </main>
  );
}
