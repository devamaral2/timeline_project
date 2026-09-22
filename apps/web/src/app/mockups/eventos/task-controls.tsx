import { Check, Circle, CircleCheck, CircleDashed, CircleSlash, Clock3, Link2, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { mediumDate } from "@repo/timeline";
import type { ExampleEvent, ExampleTask, TaskPriority, TaskStatus } from "./agenda-examples";
import styles from "./mockup.module.css";

export const taskStatuses = {
  todo: { label: "A fazer", Icon: Circle },
  scheduled: { label: "Agendada", Icon: CircleDashed },
  inProgress: { label: "Em andamento", Icon: Clock3 },
  completed: { label: "Concluída", Icon: CircleCheck },
  canceled: { label: "Cancelada", Icon: CircleSlash },
} satisfies Record<TaskStatus, { label: string; Icon: typeof Circle }>;

export const taskPriorities: Record<TaskPriority, string> = { urgent: "Urgente", normal: "Normal", flexible: "Flexível" };

export function TaskStatusIcon({ status }: { status: TaskStatus }) {
  if (status === "inProgress") return (
    <svg viewBox="0 0 24 24" className={styles.taskStatusIcon} data-status={status} fill="none" stroke="currentColor" aria-hidden>
      <circle cx="12" cy="12" r="9" /><path d="M12 6a6 6 0 0 1 0 12Z" fill="currentColor" stroke="none" />
    </svg>
  );
  const { Icon } = taskStatuses[status];
  return <Icon aria-hidden className={styles.taskStatusIcon} data-status={status} />;
}

export function TaskPriorityIcon({ priority, decorative = false }: { priority: TaskPriority; decorative?: boolean }) {
  return (
    <span className={styles.taskPriority} data-priority={priority} role={decorative ? undefined : "img"} aria-hidden={decorative || undefined} aria-label={decorative ? undefined : `Prioridade da tarefa: ${taskPriorities[priority]}`} title={decorative ? undefined : `Prioridade da tarefa: ${taskPriorities[priority]}`}>
      <svg viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M3 12V9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M8 12V6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity={priority === "flexible" ? .25 : 1} />
        <path d="M13 12V3" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity={priority === "urgent" ? 1 : .25} />
      </svg>
    </span>
  );
}

export interface SelectedEvent { event: ExampleEvent; dayKey: string }

export function EventTaskDialog({ selected, task, missed, onTaskChange, onMissedChange, onClose }: {
  selected: SelectedEvent | null;
  task?: ExampleTask;
  missed: boolean;
  onTaskChange: (task: ExampleTask) => void;
  onMissedChange: (missed: boolean) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (selected) dialogRef.current?.showModal();
  }, [selected]);

  return (
    <dialog ref={dialogRef} className={styles.taskDialog} aria-labelledby="event-task-title" onClose={onClose}
      onPointerDown={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialogRef.current?.close();
      }}>
      {selected ? <div className={styles.taskDialogContent}>
        <header className={styles.taskDialogHeading}>
          <div><p>{task ? <><Link2 aria-hidden />Tarefa vinculada · {task.id}</> : "Na sua agenda"}</p><h2 id="event-task-title">{selected.event.name}</h2></div>
          <button type="button" aria-label="Fechar detalhes" onClick={() => dialogRef.current?.close()}><X aria-hidden /></button>
        </header>
        {task ? <>
          <fieldset className={styles.statusOptions}>
            <legend>Status da tarefa</legend>
            {(Object.keys(taskStatuses) as TaskStatus[]).map((status) => (
              <label key={status} data-selected={status === task.status}>
                <input type="radio" name="task-status" value={status} checked={status === task.status} onChange={() => onTaskChange({ ...task, status })} />
                <TaskStatusIcon status={status} /><span>{taskStatuses[status].label}</span>
                {status === task.status ? <Check aria-hidden className={styles.selectedCheck} /> : null}
              </label>
            ))}
          </fieldset>
          <fieldset className={styles.priorityOptions}>
            <legend>Prioridade da tarefa</legend>
            {(Object.keys(taskPriorities) as TaskPriority[]).map((priority) => (
              <label key={priority} data-selected={priority === task.priority}>
                <input type="radio" name="task-priority" aria-label={taskPriorities[priority]} value={priority} checked={priority === task.priority} onChange={() => onTaskChange({ ...task, priority })} />
                <TaskPriorityIcon priority={priority} />{taskPriorities[priority]}
              </label>
            ))}
          </fieldset>
        </> : null}
        <section className={styles.eventAnnotation} aria-label="Anotação do evento">
          <h3>Este evento <span>{mediumDate(selected.dayKey)} · {selected.event.time}</span></h3>
          <label><input type="checkbox" checked={missed} onChange={(event) => onMissedChange(event.target.checked)} />Não realizado</label>
          <p>{task ? "A marca vale para este horário. O status e a prioridade pertencem à tarefa." : "Uma anotação sua sobre este horário."}</p>
        </section>
        <p className={styles.taskDemoNote}>Experimente à vontade · alterações apenas nesta prévia</p>
      </div> : null}
    </dialog>
  );
}
