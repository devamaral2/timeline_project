import { formatTime, mediumDate, relativeDayLabel, shortDate } from "@repo/timeline";
import { Plus } from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";
import { EventRow } from "@/components/events/event-row";
import { ICON_STROKE_WIDTH, visualForItemType } from "@/components/events/event-visuals";
import type { FreeWindow } from "@/components/hub/hub-events";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { vtName } from "@/lib/motion/view-transition";
import { tagAccentStyle } from "@/lib/tags/tag-color";
import { EXAMPLE_TODAY, type ExampleEvent, type ExampleTask, exampleEventsOn } from "./agenda-examples";
import { spanForExample, timingForExample } from "./agenda-timing";
import { type FreeSlot, freeTimeSlots, freeWindowGrade, MIN_FREE_WINDOW_MINUTES } from "./free-time";
import styles from "./agenda.module.css";
import shell from "@/components/shell/shell.module.css";
import { type SelectedEvent, TaskPriorityIcon, TaskStatusIcon, taskStatuses } from "./task-controls";

/** Horas e minutos em destaque na serifa, com a unidade pequena ao lado. */
function DurationFigure({ minutes }: { minutes: number }) {
  return (
    <>
      {minutes >= 60 ? <><strong>{Math.floor(minutes / 60)}</strong><small>h</small></> : null}
      {minutes % 60 > 0 ? <><strong>{minutes % 60}</strong><small>min</small></> : null}
    </>
  );
}

/** Eventos e tempo livre na ordem do relógio; o tempo livre nunca vem da API. */
type AgendaRow =
  | { kind: "event"; event: ExampleEvent; index: number; startMs: number }
  | { kind: "free"; slot: FreeSlot };

function agendaRowsOf(events: readonly ExampleEvent[], dayKey: string, showFreeTime: boolean): AgendaRow[] {
  const spans = events.map((event) => spanForExample(event, dayKey));
  const freeSlots = showFreeTime ? freeTimeSlots(spans, dayKey).filter((slot) => slot.minutes >= MIN_FREE_WINDOW_MINUTES) : [];
  const rows: AgendaRow[] = [
    ...events.map((event, index): AgendaRow => ({ kind: "event", event, index, startMs: spans[index].startMs })),
    ...freeSlots.map((slot): AgendaRow => ({ kind: "free", slot })),
  ];
  const startOf = (row: AgendaRow) => row.kind === "event" ? row.startMs : row.slot.startMs;
  return rows.sort((left, right) => startOf(left) - startOf(right));
}

/** Uma janela livre: uma linha tracejada que, ao toque, leva a janela ao chat do Hermes. */
function FreeTimeRow({ slot, dayKey, now, onPlan }: { slot: FreeSlot; dayKey: string; now: number; onPlan?: (window: FreeWindow) => void }) {
  const start = formatTime(new Date(slot.startMs).toISOString());
  const end = slot.endsAtMidnight ? "24:00" : formatTime(new Date(slot.endMs).toISOString());
  const position = now >= slot.endMs ? "past" : now >= slot.startMs ? "now" : "upcoming";
  const grade = freeWindowGrade(slot.minutes);
  return (
    <li style={{ "--vt": vtName("agenda", `${dayKey}-livre-${slot.startMs}`) } as CSSProperties}>
      <button
        type="button" className={styles.freeRow} data-free-time data-time-position={position}
        style={{ "--free-low": `${grade.low}%`, "--free-high": `${grade.high}%` } as CSSProperties}
        aria-label={`Planejar com o Hermes a janela livre das ${start} às ${end}`}
        onClick={() => onPlan?.({ dayKey, startMs: slot.startMs, endMs: slot.endMs, minutes: slot.minutes, endsAtMidnight: slot.endsAtMidnight })}
      >
        <span className={styles.freeTile} aria-hidden><Plus /></span>
        <span className={styles.freeText}>
          <strong>{slot.endsAtMidnight ? "Livre até o fim do dia" : "Livre"}</strong>
          <span>{start} — {end}</span>
        </span>
        <span className={styles.duration} title={`Tempo livre: ${slot.minutes} min`}><DurationFigure minutes={slot.minutes} /></span>
      </button>
    </li>
  );
}

export function AgendaDay({ dayKey, now, tasks, missedEvents, onSelectEvent, onPlanFreeWindow, events: suppliedEvents, userId, todayKey = EXAMPLE_TODAY, hideWhenEmpty = false, showHeading = true, showFreeTime = true, loading = false, selected = false, freshIds }: {
  dayKey: string;
  now: number;
  tasks: Record<string, ExampleTask>;
  missedEvents: Record<string, boolean>;
  onSelectEvent: (selected: SelectedEvent) => void;
  onPlanFreeWindow?: (window: FreeWindow) => void;
  events?: ExampleEvent[];
  userId?: string;
  todayKey?: string;
  hideWhenEmpty?: boolean;
  showHeading?: boolean;
  showFreeTime?: boolean;
  /** O dia ainda não chegou da API: linhas-fantasma no lugar do "dia livre". */
  loading?: boolean;
  /** O dia em foco: só as linhas dele deslizam quando a lista muda. */
  selected?: boolean;
  /** Eventos que acabaram de aparecer numa recarga; a linha deles chega com o banho. */
  freshIds?: ReadonlySet<string>;
}) {
  const events = suppliedEvents ?? exampleEventsOn(dayKey);
  if (hideWhenEmpty && events.length === 0) return null;
  const rows = agendaRowsOf(events, dayKey, showFreeTime);

  return (
    <section className={styles.dayGroup} data-agenda-day={dayKey} data-selected={selected || undefined} aria-label={mediumDate(dayKey)}>
      {showHeading ? <div className={styles.dayHeading}>
        <h2>{relativeDayLabel(dayKey, todayKey)}<span>{shortDate(dayKey).toLowerCase()}</span></h2>
        <span>{events.length} {events.length === 1 ? "evento" : "eventos"}</span>
      </div> : null}
      {events.length === 0 && loading ? <ListSkeleton /> : events.length === 0 ? <div className={styles.freeDay}><p>Um dia livre, do seu jeito.</p><span>Sua agenda está aberta para o que faz bem a você.</span></div> : (
        <ol className={styles.list}>
          {rows.map((row) => {
            if (row.kind === "free") return <FreeTimeRow key={`free-${row.slot.startMs}`} slot={row.slot} dayKey={dayKey} now={now} onPlan={onPlanFreeWindow} />;
            const { event, index } = row;
            // Evento da API: a linha única desenha o cartão do contrato; a prévia sem usuário segue com o desenho de exemplo.
            if (userId && event.card) return <EventRow key={event.card.id} card={event.card} userId={userId} now={new Date(now)} />;
            const { Icon, label } = visualForItemType(event.type);
            const task = event.task ? tasks[event.task.id] ?? event.task : undefined;
            const missed = missedEvents[`${dayKey}:${event.id ?? event.name}`] ?? event.missed ?? false;
            const timing = timingForExample(event, dayKey, now);
            const tags = [...(event.tag ? [event.tag] : []), ...(event.tags ?? [])];
            return (
              <li key={event.id ?? `${event.name}-${index}`} data-fresh={(event.id && freshIds?.has(event.id)) || undefined} style={{ "--vt": vtName("agenda", `${dayKey}-${event.id ?? index}`) } as CSSProperties}>
                <article className={styles.row} data-type={event.type} data-time-position={timing.position} data-missed={missed || undefined}>
                  <span className={styles.tile}><Icon strokeWidth={ICON_STROKE_WIDTH} aria-label={label} /></span>
                  <div className={styles.rowText}>
                    <h3>{event.href || userId ? <Link href={event.href ?? `/${userId}/eventos/${event.id}`} className={styles.rowLink}>{event.name}</Link> : <button type="button" className={styles.rowTitleButton} onClick={() => onSelectEvent({ event, dayKey })}>{event.name}</button>}</h3>
                    <p className={styles.rowMeta}>
                      <span>{event.time}</span>
                      {tags.length > 0 ? <><i aria-hidden>·</i>{tags.map((tag) => <span key={tag} style={tagAccentStyle(tag)}>#{tag}</span>)}</> : null}
                      {missed ? <span className={styles.missed}>Não realizado</span> : null}
                    </p>
                  </div>
                  <div className={styles.rowAside}>
                    {event.minutes > 0 ? <p className={styles.duration} title={`${timing.position === "past" ? "Duração" : "Duração prevista"}: ${event.duration}`}><DurationFigure minutes={event.minutes} /></p> : null}
                    {task ? <fieldset className={styles.taskRef} aria-label={`Tarefa vinculada ${task.id}`}>
                      <span>{task.id}</span>
                      <button type="button" className={shell.taskStatusButton} aria-label={`Tarefa de ${event.name}: ${taskStatuses[task.status].label}`} aria-haspopup="dialog" title={`Tarefa ${task.id} · ${taskStatuses[task.status].label}`} onClick={() => onSelectEvent({ event, dayKey })}><TaskStatusIcon status={task.status} /></button>
                      <TaskPriorityIcon priority={task.priority} />
                    </fieldset> : null}
                  </div>
                </article>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
