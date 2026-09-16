import { elapsedSecondsOf, formatStopwatch, mediumDate, relativeDayLabel, shortDate } from "@repo/timeline";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { ICON_STROKE_WIDTH, visualForItemType } from "@/components/events/event-visuals";
import { EXAMPLE_TODAY, type ExampleEvent, type ExampleTask, exampleEventsOn } from "./agenda-examples";
import { timingForExample } from "./agenda-timing";
import styles from "./mockup.module.css";
import { type SelectedEvent, TaskPriorityIcon, TaskStatusIcon, taskStatuses } from "./task-controls";

export function AgendaDay({ dayKey, now, tasks, missedEvents, onSelectEvent, events: suppliedEvents, userId, todayKey = EXAMPLE_TODAY }: {
  dayKey: string;
  now: number;
  tasks: Record<string, ExampleTask>;
  missedEvents: Record<string, boolean>;
  onSelectEvent: (selected: SelectedEvent) => void;
  events?: ExampleEvent[];
  userId?: string;
  todayKey?: string;
}) {
  const events = suppliedEvents ?? exampleEventsOn(dayKey);
  return (
    <section className={styles.dayGroup} data-agenda-day={dayKey} aria-label={mediumDate(dayKey)}>
      <div className={styles.dayHeading}>
        <h2>{relativeDayLabel(dayKey, todayKey)}<span>{shortDate(dayKey).toLowerCase()}</span></h2>
        <span>{events.length} eventos</span>
      </div>
      {events.length === 0 ? <p className={styles.emptyDay}>Um dia livre na sua agenda.</p> : (
        <ul className={styles.eventList}>
          {events.map((event, index) => {
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
                        {event.tag ? <span className={styles.tag}>{event.tag}</span> : null}
                        {event.tags?.map((tag) => <span className={styles.tag} key={tag}>{tag}</span>)}
                        {missed ? <span className={styles.missedBadge}>Não realizado</span> : null}
                      </div> : null}
                    </div>
                    {event.href ? <ChevronRight className={styles.eventChevron} aria-hidden /> : null}
                    {stopwatch !== null ? (
                      <span className={`${styles.eventDuration} ${styles.stopwatch}`} role="timer" aria-label="Tempo decorrido do evento" aria-live="off">{stopwatch}</span>
                    ) : (
                      <span className={styles.eventDuration} title={`${timing.position === "upcoming" ? "Duração prevista" : "Duração"}: ${event.duration}`}>
                        {event.minutes >= 60 ? <><strong>{Math.floor(event.minutes / 60)}</strong><small>h</small></> : null}
                        {event.minutes % 60 > 0 || event.minutes === 0 ? <><strong>{event.minutes % 60}</strong><small>min</small></> : null}
                      </span>
                    )}
                    {task ? <fieldset className={styles.taskReference} aria-label={`Tarefa vinculada ${task.id}`}>
                      <span>{task.id}</span>
                      <button type="button" className={styles.taskStatusButton} aria-label={`Tarefa de ${event.name}: ${taskStatuses[task.status].label}`} aria-haspopup="dialog" title={`Tarefa ${task.id} · ${taskStatuses[task.status].label}`} onClick={() => onSelectEvent({ event, dayKey })}><TaskStatusIcon status={task.status} /></button>
                      <TaskPriorityIcon priority={task.priority} />
                    </fieldset> : null}
                  </div>
                  <div aria-hidden className={styles.eventDurationBar}>
                    <span style={{ width: `${Math.min(100, Math.max(6, (timing.position === "running" ? elapsedSecondsOf(timing.startedAt, new Date(now)) / 60 : event.minutes) / 90 * 100))}%` }} />
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
