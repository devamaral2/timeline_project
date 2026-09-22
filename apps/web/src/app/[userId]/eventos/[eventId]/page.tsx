"use client";

import { CalendarDays, Clock3, FileText, MoreHorizontal, Pencil, Trash2, Utensils, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DeleteEventDialog } from "@/components/events/DeleteEventDialog";
import { EditEventModal } from "@/components/events/EditEventModal";
import { ICON_STROKE_WIDTH, visualForItemType } from "@/components/events/event-visuals";
import { authedFetch } from "@/lib/api/authed-fetch";
import type { EventDetailDto, EventItemDto, MealItem, TrainingData } from "@/lib/api/contracts";
import { dayKeyOf, eventPositionOf, formatTime, longDate } from "@repo/timeline";
import { endLabelOf } from "@/lib/events/event-window";
import { agendaRefreshEvent } from "../../../mockups/eventos/agenda-refresh";
import styles from "../../../mockups/eventos/mockup.module.css";

export default function EventPage({ params }: { params: Promise<{ userId: string; eventId: string }> }) {
  const router = useRouter();
  const [eventId, setEventId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [event, setEvent] = useState<EventDetailDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [savingMissed, setSavingMissed] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reload, setReload] = useState(0);

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
    void reload;
    if (!eventId) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    void authedFetch<EventDetailDto>(`/api/events/${eventId}`)
      .then((data) => { if (!cancelled) setEvent(data); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [eventId, reload]);

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
      setMutationError("Não foi possível atualizar a anotação. Tente novamente.");
    } finally {
      setSavingMissed(false);
    }
  }

  if (loading) return <main id="conteudo" className={styles.detailMain}><p role="status">Carregando evento…</p></main>;
  if (error || !event || !userId) return (
    <main id="conteudo" className={styles.detailMain}>
      <button type="button" className={styles.backLink} onClick={() => router.back()}><X aria-hidden />Voltar</button>
      <p role="alert" className={styles.detailError}>Não foi possível carregar o evento. Tente novamente.</p>
    </main>
  );

  const primary = event.items.find((item) => item.id === event.primaryItemId);
  const visual = visualForItemType(primary?.type ?? "");
  const TypeIcon = visual.Icon;
  const dayKey = dayKeyOf(event.startedAt);
  const durationMinutes = event.finishedAt
    ? Math.max(0, Math.round((new Date(event.finishedAt).getTime() - new Date(event.startedAt).getTime()) / 60_000))
    : 0;
  const durationLabel = event.finishedAt
    ? `${durationMinutes} min`
    : eventPositionOf(event, new Date()) === "upcoming"
      ? "Ainda nao comecou"
      : "Em andamento";

  return (
    <main id="conteudo" className={styles.detailMain}>
      <div className={styles.detailNavigation}>
        <button type="button" className={styles.backLink} onClick={() => router.push(`/${userId}`)} aria-label="Voltar à agenda"><span aria-hidden>←</span><span>Agenda</span></button>
        <span className={styles.detailBrand}>Braid</span>
        <button type="button" disabled className={styles.iconButton} aria-label="Mais opções do evento"><MoreHorizontal aria-hidden /></button>
      </div>

      <header className={styles.detailHeading} data-type={primary?.type ?? "routine"}>
        <span className={styles.detailType}><TypeIcon aria-hidden strokeWidth={ICON_STROKE_WIDTH} />{visual.label}</span>
        <h1>{event.name}</h1>
        {event.description ? <p>{event.description}</p> : null}
        <div className={styles.detailMeta}>
          <span><CalendarDays aria-hidden />{longDate(dayKey)}</span>
          <span><Clock3 aria-hidden />{formatTime(event.startedAt)} — {endLabelOf(event, new Date())}<span className={styles.detailDuration}>{durationLabel}</span></span>
        </div>
        <div className={styles.detailDurationTrack} aria-hidden><span style={{ width: `${Math.min(100, Math.max(6, durationMinutes / 90 * 100))}%`, background: `var(--${primary?.type ?? "routine"})` }} /></div>
      </header>

      <section className={styles.detailInfo} aria-label="Informações do evento">
        {event.description ? <DetailRow icon={<FileText aria-hidden />} title="Descrição"><p>{event.description}</p></DetailRow> : null}
        {primary ? <ItemRow item={primary} /> : null}
        {event.tags.length ? <DetailRow icon={<FileText aria-hidden />} title="Tags"><p>{event.tags.map((tag) => `#${tag}`).join(" · ")}</p></DetailRow> : null}
        {event.interruptions.length ? <DetailRow icon={<Clock3 aria-hidden />} title="Interrupções"><p>{event.interruptions.map((item) => `${item.name} (${durationOf(item.startedAt, item.finishedAt)})`).join(" · ")}</p></DetailRow> : null}
      </section>

      {primary?.type === "meal" ? <Nutrition data={primary.data} /> : null}

      <div className={styles.detailFooter}>
        <label className={styles.missedCheckbox}><input type="checkbox" checked={event.missed} disabled={savingMissed} onChange={(inputEvent) => void updateMissed(inputEvent.target.checked)} />Não realizado</label>
        <div className={styles.detailActions}>
          <button type="button" className={styles.deleteButton} onClick={() => setDeleting(true)}><Trash2 aria-hidden />Excluir</button>
          <button type="button" className={styles.editButton} onClick={() => setEditing(true)}><Pencil aria-hidden />Editar evento</button>
        </div>
      </div>
      {mutationError ? <p role="alert" className={styles.detailError}>{mutationError}</p> : null}

      {editing ? <EditEventModal eventId={event.id} onClose={() => setEditing(false)} onUpdated={() => { setEditing(false); setReload((value) => value + 1); window.dispatchEvent(new Event(agendaRefreshEvent)); }} /> : null}
      {deleting ? <DeleteEventDialog eventId={event.id} eventName={event.name} onClose={() => setDeleting(false)} onDeleted={() => { window.dispatchEvent(new Event(agendaRefreshEvent)); router.push(`/${userId}`); }} /> : null}
    </main>
  );
}

function DetailRow({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return <div><span>{icon}</span><div><h2>{title}</h2>{children}</div></div>;
}

function ItemRow({ item }: { item: EventItemDto }) {
  if (item.type === "meal") return <DetailRow icon={<Utensils aria-hidden />} title="Refeição"><p>{item.data.name}{item.data.description ? ` — ${item.data.description}` : ""}</p></DetailRow>;
  if (item.type === "training") return <DetailRow icon={<Clock3 aria-hidden />} title="Treinos"><p>{(item.data as TrainingData).workouts.map((workout) => workout.workoutName).join(" · ") || "Nenhum treino detalhado"}</p></DetailRow>;
  if (item.type === "sleep") return <DetailRow icon={<Clock3 aria-hidden />} title="Sono"><p>{item.data.trackedSleepTime} min monitorados · pontuação {item.data.score}</p></DetailRow>;
  return <DetailRow icon={<FileText aria-hidden />} title="Rotina"><p>Evento de rotina</p></DetailRow>;
}

function Nutrition({ data }: { data: MealItem }) {
  const values = [
    ["Calorias", data.totals.totalCaloriesKcal, "kcal"],
    ["Proteína", data.totals.totalProteinGrams, "g"],
    ["Carboidratos", data.totals.totalCarbohydrateGrams, "g"],
    ["Gorduras", data.totals.totalFatGrams, "g"],
  ] as const;
  return <section className={styles.nutrition} aria-label="Resumo nutricional"><h2>Resumo nutricional</h2><div className={styles.nutritionGrid}>{values.map(([label, value, unit]) => <div key={label}><p>{value}<span>{unit}</span></p><h3>{label}</h3></div>)}</div></section>;
}

function durationOf(startedAt: string, finishedAt: string): string {
  const minutes = Math.max(0, Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 60_000));
  return `${minutes} min`;
}
