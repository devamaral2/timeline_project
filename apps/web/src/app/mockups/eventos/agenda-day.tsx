import { elapsedSecondsOf, formatStopwatch, formatTime, mediumDate, relativeDayLabel, shortDate } from "@repo/timeline";
import { ChevronRight, Hourglass } from "lucide-react";
import Link from "next/link";
import { ICON_STROKE_WIDTH, visualForItemType } from "@/components/events/event-visuals";
import { tagColorStyle } from "@/lib/tags/tag-color";
import { EXAMPLE_TODAY, type ExampleEvent, type ExampleTask, exampleEventsOn } from "./agenda-examples";
import { spanForExample, timingForExample } from "./agenda-timing";
import { type FreeSlot, freeTimeSlots } from "./free-time";
import styles from "./mockup.module.css";
import { type SelectedEvent, TaskPriorityIcon, TaskStatusIcon, taskStatuses } from "./task-controls";

/** Horas e minutos em destaque, como o número grande do cartão de evento. */
function DurationFigure({ minutes, forceMinutes = false }: { minutes: number; forceMinutes?: boolean }) {
  return (
    <>
      {minutes >= 60 ? <><strong>{Math.floor(minutes / 60)}</strong><small>h</small></> : null}
      {minutes % 60 > 0 || forceMinutes ? <><strong>{minutes % 60}</strong><small>min</small></> : null}
    </>
  );
}

/** Eventos e tempo livre na ordem do relógio; o tempo livre é só leitura, nunca vem da API. */
type AgendaRow =
  | { kind: "event"; event: ExampleEvent; index: number; startMs: number }
  | { kind: "free"; slot: FreeSlot };

function agendaRowsOf(events: readonly ExampleEvent[], dayKey: string): AgendaRow[] {
  const spans = events.map((event) => spanForExample(event, dayKey));
  const rows: AgendaRow[] = [
    ...events.map((event, index): AgendaRow => ({ kind: "event", event, index, startMs: spans[index].startMs })),
    ...freeTimeSlots(spans, dayKey).map((slot): AgendaRow => ({ kind: "free", slot })),
  ];
  const startOf = (row: AgendaRow) => row.kind === "event" ? row.startMs : row.slot.startMs;
  return rows.sort((left, right) => startOf(left) - startOf(right));
}

function FreeTimeSlot({ slot, now }: { slot: FreeSlot; now: number }) {
  const start = formatTime(new Date(slot.startMs).toISOString());
  const end = slot.endsAtMidnight ? "24:00" : formatTime(new Date(slot.endMs).toISOString());
  const position = now >= slot.endMs ? "past" : now >= slot.startMs ? "now" : "upcoming";
  return (
    <li>
      <div className={styles.freeSlot} data-free-time data-time-position={position}>
        <Hourglass className={styles.freeSlotIcon} strokeWidth={ICON_STROKE_WIDTH} aria-hidden />
        <div className={styles.freeSlotText}>
          <p className={styles.freeSlotLabel}>Tempo livre{position === "now" ? <span className={styles.freeSlotNow}><i aria-hidden />Livre agora</span> : null}</p>
          <p className={styles.freeSlotTime}>{start} — {end}</p>
        </div>
        <span className={`${styles.eventDuration} ${styles.freeSlotDuration}`} title={`Tempo livre: ${slot.minutes} min`}>
          <DurationFigure minutes={slot.minutes} />
        </span>
      </div>
    </li>
  );
}

export function AgendaDay({ dayKey, now, tasks, missedEvents, onSelectEvent, events: suppliedEvents, userId, todayKey = EXAMPLE_TODAY, hideWhenEmpty = false, showHeading = true }: {
  dayKey: string;
  now: number;
  tasks: Record<string, ExampleTask>;
  missedEvents: Record<string, boolean>;
  onSelectEvent: (selected: SelectedEvent) => void;
  events?: ExampleEvent[];
  userId?: string;
  todayKey?: string;
  hideWhenEmpty?: boolean;
  showHeading?: boolean;
}) {
  const events = suppliedEvents ?? exampleEventsOn(dayKey);
  if (hideWhenEmpty && events.length === 0) return null;
  const rows = agendaRowsOf(events, dayKey);

  return (
    <section className={styles.dayGroup} data-agenda-day={dayKey} aria-label={mediumDate(dayKey)}>
      {showHeading ? <div className={styles.dayHeading}>
        <h2>{relativeDayLabel(dayKey, todayKey)}<span>{shortDate(dayKey).toLowerCase()}.</span></h2>
        <span>{events.length} {events.length === 1 ? "evento" : "eventos"}</span>
      </div> : null}
      {events.length === 0 ? <div className={styles.freeDay}><p>Um dia livre, do seu jeito.</p><span>Sua agenda está aberta para o que faz bem a você.</span></div> : (
        <ul className={styles.eventList}>
          {rows.map((row) => {
            if (row.kind === "free") return <FreeTimeSlot key={`free-${row.slot.startMs}`} slot={row.slot} now={now} />;
            const { event, index } = row;
            const { Icon, label } = visualForItemType(event.type);
            const task = event.task ? tasks[event.task.id] ?? event.task : undefined;
            const missed = missedEvents[`${dayKey}:${event.id ?? event.name}`] ?? event.missed ?? false;
            const timing = timingForExample(event, dayKey, now);
            const running = timing.position === "running";
            const stopwatch = running ? formatStopwatch(elapsedSecondsOf(timing.startedAt, new Date(now))) : null;
            return (
              <li key={event.id ?? `${event.name}-${index}`}>
                <article className={styles.event} data-type={event.type} data-time-position={timing.position} data-missed={missed || undefined}>
                  <div className={styles.eventMain}>
                    <Icon className={styles.typeIcon} strokeWidth={ICON_STROKE_WIDTH} aria-label={label} />
                    <div className={styles.eventText}>
                      <div className={styles.eventTitleLine}>
                        <h3>{event.href || userId ? <Link href={event.href ?? `/${userId}/eventos/${event.id}`} className={styles.eventLink}>{event.name}</Link> : <button type="button" className={styles.eventTitleButton} onClick={() => onSelectEvent({ event, dayKey })}>{event.name}</button>}</h3>
                      </div>
                      <p className={styles.eventTime}>
                        {timing.position === "past" ? <span className={styles.pastMarker} role="img" aria-label="Horário passado" title="Horário passado"><i aria-hidden /></span> : null}
                        {running ? <>{timing.startLabel}<span className={styles.runningLabel}><i aria-hidden />Em andamento</span></> : event.time}
                      </p>
                      {event.tag || event.tags?.length || missed ? <div className={styles.eventLabels}>
                        {event.tag ? <span className={styles.tag} style={tagColorStyle(event.tag)}>#{event.tag}</span> : null}
                        {event.tags?.map((tag) => <span className={styles.tag} style={tagColorStyle(tag)} key={tag}>#{tag}</span>)}
                        {missed ? <span className={styles.missedBadge}>Não realizado</span> : null}
                      </div> : null}
                    </div>
                    {event.href ? <ChevronRight className={styles.eventChevron} aria-hidden /> : null}
                    {stopwatch !== null ? (
                      <span className={`${styles.eventDuration} ${styles.stopwatch}`} role="timer" aria-label="Tempo decorrido do evento" aria-live="off">{stopwatch}</span>
                    ) : (
                      <span className={styles.eventDuration} title={`${timing.position === "upcoming" ? "Duração prevista" : "Duração"}: ${event.duration}`}>
                        <DurationFigure minutes={event.minutes} forceMinutes={event.minutes === 0} />
                      </span>
                    )}
                    {task ? <fieldset className={styles.taskReference} aria-label={`Tarefa vinculada ${task.id}`}>
                      <span>{task.id}</span>
                      <button type="button" className={styles.taskStatusButton} aria-label={`Tarefa de ${event.name}: ${taskStatuses[task.status].label}`} aria-haspopup="dialog" title={`Tarefa ${task.id} · ${taskStatuses[task.status].label}`} onClick={() => onSelectEvent({ event, dayKey })}><TaskStatusIcon status={task.status} /></button>
                      <TaskPriorityIcon priority={task.priority} />
                    </fieldset> : null}
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
