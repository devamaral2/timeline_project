"use client";

import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DeleteEventDialog } from "@/components/events/DeleteEventDialog";
import { EditEventModal } from "@/components/events/EditEventModal";
import { EventDetailScreen } from "@/components/events/EventDetailScreen";
import { authedFetch } from "@/lib/api/authed-fetch";
import type { EventDetailDto, TaskDetailDto } from "@/lib/api/contracts";
import { agendaRefreshEvent } from "../../../mockups/eventos/agenda-refresh";
import shellStyles from "../../../mockups/eventos/mockup.module.css";
import styles from "@/components/events/event-detail-screen.module.css";

/**
 * O detalhe do evento na agenda de verdade. A pagina carrega o evento e as
 * tarefas vinculadas e conduz as acoes do menu; quem desenha a tela e
 * `EventDetailScreen`, a mesma que o estudo visual dos mockups usa.
 */
export default function EventPage({ params }: { params: Promise<{ userId: string; eventId: string }> }) {
  const router = useRouter();
  const [eventId, setEventId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [event, setEvent] = useState<EventDetailDto | null>(null);
  const [tasks, setTasks] = useState<TaskDetailDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [savingMissed, setSavingMissed] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    void authedFetch<EventDetailDto>(`/api/events/${eventId}`)
      .then((data) => { if (!cancelled) setEvent(data); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [eventId]);

  /*
   * As tarefas vinculadas vem uma a uma, porque e o que a API oferece. Uma que
   * falhe some da lista em vez de derrubar a secao: o evento continua legivel
   * sem ela.
   */
  const taskIds = event?.taskIds;
  useEffect(() => {
    if (!taskIds?.length) { setTasks([]); return; }
    let cancelled = false;
    void Promise.all(
      taskIds.map((taskId) => authedFetch<TaskDetailDto>(`/api/tasks/${taskId}`).catch(() => null)),
    ).then((loaded) => {
      if (!cancelled) setTasks(loaded.filter((task): task is TaskDetailDto => task !== null));
    });
    return () => { cancelled = true; };
  }, [taskIds]);

  async function toggleMissed() {
    if (!event || savingMissed) return;
    const previous = event;
    const missed = !event.missed;
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
      setMutationError("Não foi possível atualizar a anotação. Tente novamente.");
    } finally {
      setSavingMissed(false);
    }
  }

  if (loading) return (
    <main id="conteudo" className={shellStyles.detailMain}>
      <p role="status" className={styles.message}>Carregando evento…</p>
    </main>
  );

  if (error || !event || !userId) return (
    <main id="conteudo" className={shellStyles.detailMain}>
      <div className={styles.screen}>
        <div className={styles.topBar}>
          <button type="button" className={styles.iconAction} aria-label="Voltar" onClick={() => router.back()}>
            <ArrowLeft aria-hidden />
          </button>
        </div>
        <p role="alert" className={`${styles.message} ${styles.error}`}>
          Não foi possível carregar o evento. Tente novamente.
        </p>
      </div>
    </main>
  );

  return (
    <main id="conteudo" className={shellStyles.detailMain}>
      <EventDetailScreen
        event={event}
        tasks={tasks}
        backHref={`/${userId}`}
        actionError={mutationError}
        actions={{
          savingMissed,
          onEdit: () => setEditing(true),
          onToggleMissed: () => void toggleMissed(),
          onDelete: () => setDeleting(true),
        }}
      />

      {editing ? (
        <EditEventModal
          eventId={event.id}
          onClose={() => setEditing(false)}
          onUpdated={() => window.location.reload()}
        />
      ) : null}

      {deleting ? (
        <DeleteEventDialog
          eventId={event.id}
          eventName={event.name}
          onClose={() => setDeleting(false)}
          onDeleted={() => router.push(`/${userId}`)}
        />
      ) : null}
    </main>
  );
}
