import { elapsedSecondsOf, formatStopwatch, mediumDate, relativeDayLabel, shortDate } from "@repo/timeline";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { ICON_STROKE_WIDTH, visualForItemType } from "@/components/events/event-visuals";
import { EXAMPLE_TODAY, exampleEventsOn, type ExampleTask } from "./agenda-examples";
import { timingForExample } from "./agenda-timing";
import { TaskPriorityIcon, TaskStatusIcon, taskStatuses, type SelectedEvent } from "./task-controls";
import styles from "./mockup.module.css";

export function AgendaDay({ dayKey, now, tasks, missedEvents, onSelectEvent }: {
  dayKey: string;
  now: number;
  tasks: Record<string, ExampleTask>;
  missedEvents: Record<string, boolean>;
  onSelectEvent: (selected: SelectedEvent) => void;
}) {
  const events = exampleEventsOn(dayKey);
  return (
    <section className={styles.dayGroup} data-agenda-day={dayKey} aria-label={mediumDate(dayKey)}>
      <div className={styles.dayHeading}>
        <h2>{relativeDayLabel(dayKey, EXAMPLE_TODAY)}<span>{shortDate(dayKey).toLowerCase()}</span></h2>
        <span>{events.length} eventos</span>
      </div>
      {events.length === 0 ? <p className={styles.emptyDay}>Um dia livre na sua agenda.</p> : (
        <ul className={styles.eventList}>
          {events.map((event) => {
            const { Icon, label } = visualForItemType(event.type);
            const task = event.task ? tasks[event.task.id] ?? event.task : undefined;
            const missed = missedEvents[`${dayKey}:${event.name}`] ?? event.missed ?? false;
            const timing = timingForExample(event, dayKey, now);
            const running = timing.position === "running";
            const stopwatch = running ? formatStopwatch(elapsedSecondsOf(timing.startedAt, new Date(now))) : null;
            return (
              <li key={event.name}>
                <article className={styles.event} data-type={event.type} data-time-position={timing.position}>
                  <div className={styles.eventMain}>
                    <Icon className={styles.typeIcon} strokeWidth={ICON_STROKE_WIDTH} aria-label={label} />
                    <div className={styles.eventText}>
                      <div className={styles.eventTitleLine}>
                        <h3>{event.href ? <Link href={event.href} className={styles.eventLink}>{event.name}</Link> : <button type="button" className={styles.eventTitleButton} onClick={() => onSelectEvent({ event, dayKey })}>{event.name}</button>}</h3>
                      </div>
                      <p className={styles.eventTime}>
                        {running ? <>{timing.startLabel}<span className={styles.runningLabel}><i aria-hidden />Em andamento</span></> : event.time}
                      </p>
                      {event.tag || missed ? <div className={styles.eventLabels}>
                        {event.tag ? <span className={styles.tag}>{event.tag}</span> : null}
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
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
