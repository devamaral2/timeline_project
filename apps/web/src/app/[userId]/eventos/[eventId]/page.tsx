"use client";

import { ArrowLeft, ArrowRight, CalendarDays } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ICON_STROKE_WIDTH, visualForItemType } from "@/components/events/event-visuals";
import { authedFetch } from "@/lib/api/authed-fetch";
import type { EventDetailDto, EventItemDto, MealItem } from "@/lib/api/contracts";
import { dayKeyOf, eventPositionOf, formatTime, longDate } from "@repo/timeline";
import { agendaRefreshEvent } from "../../../mockups/eventos/agenda-refresh";
import shellStyles from "../../../mockups/eventos/mockup.module.css";
import styles from "./event-details.module.css";

export default function EventPage({ params }: { params: Promise<{ userId: string; eventId: string }> }) {
  const router = useRouter();
  const [eventId, setEventId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [event, setEvent] = useState<EventDetailDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [savingMissed, setSavingMissed] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

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

  if (loading) return <main id="conteudo" className={shellStyles.detailMain}><p role="status" className={styles.message}>Carregando evento…</p></main>;
  if (error || !event || !userId) return (
    <main id="conteudo" className={shellStyles.detailMain}>
      <button type="button" className={styles.backLink} onClick={() => router.back()}><ArrowLeft aria-hidden />Voltar</button>
      <p role="alert" className={styles.message}>Não foi possível carregar o evento. Tente novamente.</p>
    </main>
  );

  const primary = event.items.find((item) => item.id === event.primaryItemId);
  const visual = visualForItemType(primary?.type ?? "");
  const TypeIcon = visual.Icon;
  const dayKey = dayKeyOf(event.startedAt);
  const upcoming = eventPositionOf(event, new Date()) === "upcoming";
  const endDayKey = event.finishedAt ? dayKeyOf(event.finishedAt) : null;

  return (
    <main id="conteudo" className={shellStyles.detailMain}>
      <div className={styles.content}>
        <nav className={styles.navigation} aria-label="Navegação do evento">
          <a href={`/${userId}`} className={styles.backLink}><ArrowLeft aria-hidden />Agenda</a>
          <span>Detalhes do evento</span>
        </nav>

        <header className={styles.heading} data-type={primary?.type ?? "routine"}>
          <span className={styles.type}><TypeIcon aria-hidden strokeWidth={ICON_STROKE_WIDTH} />{visual.label}</span>
          <h1>{event.name}</h1>
          <p className={styles.date}><CalendarDays aria-hidden /><time dateTime={dayKey}>{longDate(dayKey)}</time></p>
        </header>

        <section className={styles.schedule} aria-label="Horário do evento">
          <dl className={styles.times}>
            <div>
              <dt>Início</dt>
              <dd><time dateTime={event.startedAt}>{formatTime(event.startedAt)}</time></dd>
              <ArrowRight className={styles.timeArrow} aria-hidden />
            </div>
            <div>
              <dt>Fim</dt>
              <dd>{event.finishedAt ? <time dateTime={event.finishedAt}>{formatTime(event.finishedAt)}</time> : <span className={styles.openEnd}>{upcoming ? "A definir" : "Em andamento"}</span>}</dd>
              {endDayKey && endDayKey !== dayKey ? <span className={styles.endDate}>{longDate(endDayKey)}</span> : null}
            </div>
          </dl>
          {event.finishedAt ? <p className={styles.duration}>{durationOf(event.startedAt, event.finishedAt)}</p> : null}
        </section>

        {event.description ? <DetailSection title="Descrição"><p className={styles.prose}>{event.description}</p></DetailSection> : null}
        {event.items.map((item) => <ItemDetails key={item.id} item={item} />)}
        {event.tags.length ? (
          <ul className={styles.tags} aria-label="Tags do evento">
            {event.tags.map((tag) => <li key={tag}>#{tag}</li>)}
          </ul>
        ) : null}
        {event.interruptions.length ? (
          <DetailSection title="Interrupções">
            <ul className={styles.list}>
              {event.interruptions.map((item) => <li key={item.id}><div><p>{item.name}</p>{item.description ? <p className={styles.secondary}>{item.description}</p> : null}</div><span>{durationOf(item.startedAt, item.finishedAt)}</span></li>)}
            </ul>
          </DetailSection>
        ) : null}

        <footer className={styles.footer}>
          <label className={styles.missed}>
            <input type="checkbox" checked={event.missed} disabled={savingMissed} onChange={(inputEvent) => void updateMissed(inputEvent.target.checked)} />
            Não realizado
          </label>
          {savingMissed ? <span role="status">Salvando…</span> : null}
        </footer>
        {mutationError ? <p role="alert" className={styles.message}>{mutationError}</p> : null}
      </div>
    </main>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className={styles.section}><h2>{title}</h2>{children}</section>;
}

function ItemDetails({ item }: { item: EventItemDto }) {
  if (item.type === "meal") return (
    <DetailSection title="Refeição">
      <p>{item.data.name}</p>
      {item.data.description ? <p className={styles.secondary}>{item.data.description}</p> : null}
      <Nutrition data={item.data} />
    </DetailSection>
  );
  if (item.type === "training" && item.data.workouts.length) return (
    <DetailSection title="Treinos">
      <ul className={styles.list}>
        {item.data.workouts.map((workout) => <li key={workout.id}><p>{workout.workoutName}</p><span>{workout.duration} min · {workout.calories} kcal</span></li>)}
      </ul>
    </DetailSection>
  );
  if (item.type === "sleep") return <DetailSection title="Sono"><p>{item.data.trackedSleepTime} min monitorados <span className={styles.secondary}>· pontuação {item.data.score}</span></p></DetailSection>;
  return null;
}

function Nutrition({ data }: { data: MealItem }) {
  const values = [
    ["Calorias", data.totals.totalCaloriesKcal, "kcal"],
    ["Proteína", data.totals.totalProteinGrams, "g"],
    ["Carboidratos", data.totals.totalCarbohydrateGrams, "g"],
    ["Gorduras", data.totals.totalFatGrams, "g"],
  ] as const;
  return <dl className={styles.nutrition} aria-label="Resumo nutricional">{values.map(([label, value, unit]) => <div key={label}><dt>{label}</dt><dd>{value}<span>{unit}</span></dd></div>)}</dl>;
}

function durationOf(startedAt: string, finishedAt: string): string {
  const minutes = Math.max(0, Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const remaining = minutes % 60;
  return `${Math.floor(minutes / 60)} h${remaining ? ` ${remaining} min` : ""}`;
}
