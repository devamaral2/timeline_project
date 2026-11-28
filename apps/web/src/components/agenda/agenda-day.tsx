import type { TaskCardDto } from "@repo/contracts";
import { formatTime, mediumDate, relativeDayLabel, shortDate } from "@repo/timeline";
import { Plus } from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";
import { TaskRow } from "@/components/tasks/task-row";
import { ICON_STROKE_WIDTH, visualForItemType } from "@/components/tasks/task-visuals";
import type { FreeWindow } from "@/components/hub/hub-open";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { vtName } from "@/lib/motion/view-transition";
import { tagAccentStyle } from "@/lib/tags/tag-color";
import { EXAMPLE_TODAY, type ExampleTask, type ExampleTrackedTask, exampleTasksOn } from "./agenda-examples";
import { spanForExample, timingForExample } from "./agenda-timing";
import { type FreeSlot, freeTimeSlots, freeWindowGrade, MIN_FREE_WINDOW_MINUTES } from "./free-time";
import styles from "./agenda.module.css";
import shell from "@/components/shell/shell.module.css";
import { type SelectedTask, TaskPriorityIcon, TaskStatusIcon, statusView } from "./task-controls";

/** Horas e minutos em destaque na serifa, com a unidade pequena ao lado. */
function DurationFigure({ minutes }: { minutes: number }) {
  return (
    <>
      {minutes >= 60 ? <><strong>{Math.floor(minutes / 60)}</strong><small>h</small></> : null}
      {minutes % 60 > 0 ? <><strong>{minutes % 60}</strong><small>min</small></> : null}
    </>
  );
}

/** Tarefas e tempo livre na ordem do relógio; o tempo livre nunca vem da API. */
type AgendaRow =
  | { kind: "task"; task: ExampleTask; index: number; startMs: number }
  | { kind: "free"; slot: FreeSlot };

/** O tempo livre é só de pessoa: uma tarefa do agente não divide nem encurta uma janela. A prévia sem cartão conta como de pessoa. */
function agendaRowsOf(tasks: readonly ExampleTask[], dayKey: string, showFreeTime: boolean): AgendaRow[] {
  const spans = tasks.map((task) => spanForExample(task, dayKey));
  const personSpans = tasks.filter((task) => task.card?.actor !== "agent").map((task) => spanForExample(task, dayKey));
  const freeSlots = showFreeTime ? freeTimeSlots(personSpans, dayKey).filter((slot) => slot.minutes >= MIN_FREE_WINDOW_MINUTES) : [];
  const rows: AgendaRow[] = [
    ...tasks.map((task, index): AgendaRow => ({ kind: "task", task, index, startMs: spans[index].startMs })),
    ...freeSlots.map((slot): AgendaRow => ({ kind: "free", slot })),
  ];
  const startOf = (row: AgendaRow) => row.kind === "task" ? row.startMs : row.slot.startMs;
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

export function AgendaDay({ dayKey, now, trackings, missedTasks, onSelectTask, onPlanFreeWindow, onStatusClick, tasks: suppliedTasks, userId, todayKey = EXAMPLE_TODAY, hideWhenEmpty = false, showHeading = true, showFreeTime = true, loading = false, selected = false, freshIds }: {
  dayKey: string;
  now: number;
  trackings: Record<string, ExampleTrackedTask>;
  missedTasks: Record<string, boolean>;
  onSelectTask: (selected: SelectedTask) => void;
  onPlanFreeWindow?: (window: FreeWindow) => void;
  /** Toque no glifo de uma tarefa de pessoa (a tela decide o que ele abre). */
  onStatusClick?: (card: TaskCardDto, anchor: HTMLElement) => void;
  tasks?: ExampleTask[];
  userId?: string;
  todayKey?: string;
  hideWhenEmpty?: boolean;
  showHeading?: boolean;
  showFreeTime?: boolean;
  /** O dia ainda não chegou da API: linhas-fantasma no lugar do "dia livre". */
  loading?: boolean;
  /** O dia em foco: só as linhas dele deslizam quando a lista muda. */
  selected?: boolean;
  /** Tarefas que acabaram de aparecer numa recarga; a linha deles chega com o banho. */
  freshIds?: ReadonlySet<string>;
}) {
  const tasks = suppliedTasks ?? exampleTasksOn(dayKey);
  if (hideWhenEmpty && tasks.length === 0) return null;
  const rows = agendaRowsOf(tasks, dayKey, showFreeTime);

  return (
    <section className={styles.dayGroup} data-agenda-day={dayKey} data-selected={selected || undefined} aria-label={mediumDate(dayKey)}>
      {showHeading ? <div className={styles.dayHeading}>
        <h2>{relativeDayLabel(dayKey, todayKey)}<span>{shortDate(dayKey).toLowerCase()}</span></h2>
        <span>{tasks.length} {tasks.length === 1 ? "tarefa" : "tarefas"}</span>
      </div> : null}
      {tasks.length === 0 && loading ? <ListSkeleton /> : tasks.length === 0 ? <div className={styles.freeDay}><p>Um dia livre, do seu jeito.</p><span>Sua agenda está aberta para o que faz bem a você.</span></div> : (
        <ol className={styles.list}>
          {rows.map((row) => {
            if (row.kind === "free") return <FreeTimeRow key={`free-${row.slot.startMs}`} slot={row.slot} dayKey={dayKey} now={now} onPlan={onPlanFreeWindow} />;
            const { task, index } = row;
            // Tarefa da API: a linha única desenha o cartão do contrato; a prévia sem usuário segue com o desenho de exemplo.
            if (userId && task.card) return <TaskRow key={task.card.id} card={task.card} userId={userId} now={new Date(now)} onStatusClick={onStatusClick} />;
            const { Icon, label } = visualForItemType(task.type);
            const tracking = task.tracking ? trackings[task.tracking.id] ?? task.tracking : undefined;
            const missed = missedTasks[`${dayKey}:${task.id ?? task.name}`] ?? task.missed ?? false;
            const timing = timingForExample(task, dayKey, now);
            const tags = [...(task.tag ? [task.tag] : []), ...(task.tags ?? [])];
            return (
              <li key={task.id ?? `${task.name}-${index}`} data-fresh={(task.id && freshIds?.has(task.id)) || undefined} style={{ "--vt": vtName("agenda", `${dayKey}-${task.id ?? index}`) } as CSSProperties}>
                <article className={styles.row} data-type={task.type} data-time-position={timing.position} data-missed={missed || undefined}>
                  <span className={styles.tile}><Icon strokeWidth={ICON_STROKE_WIDTH} aria-label={label} /></span>
                  <div className={styles.rowText}>
                    <h3>{task.href || userId ? <Link href={task.href ?? `/${userId}/tarefas/${task.id}`} className={styles.rowLink}>{task.name}</Link> : <button type="button" className={styles.rowTitleButton} onClick={() => onSelectTask({ task, dayKey })}>{task.name}</button>}</h3>
                    <p className={styles.rowMeta}>
                      <span>{task.time}</span>
                      {tags.map((tag) => <span key={tag} style={tagAccentStyle(tag)}>#{tag}</span>)}
                      {missed ? <span className={styles.missed}>Não realizado</span> : null}
                    </p>
                  </div>
                  <div className={styles.rowAside}>
                    {task.minutes > 0 ? <p className={styles.duration} title={`${timing.position === "past" ? "Duração" : "Duração prevista"}: ${task.duration}`}><DurationFigure minutes={task.minutes} /></p> : null}
                    {tracking ? <fieldset className={styles.taskRef} aria-label={`Tarefa vinculada ${tracking.id}`}>
                      <span>{tracking.id}</span>
                      <button type="button" className={shell.taskStatusButton} aria-label={`Tarefa de ${task.name}: ${statusView[tracking.status].label}`} aria-haspopup="dialog" title={`Tarefa ${tracking.id} · ${statusView[tracking.status].label}`} onClick={() => onSelectTask({ task, dayKey })}><TaskStatusIcon status={tracking.status} /></button>
                      <TaskPriorityIcon priority={tracking.priority} />
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
