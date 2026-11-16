import { Check, Circle, CircleCheck, CircleDashed, CircleSlash, Clock3, Link2, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { mediumDate } from "@repo/timeline";
import type { ExampleTask, ExamplePriority, ExampleStatus, ExampleTracking } from "./agenda-examples";
import styles from "@/components/shell/shell.module.css";

export const statusView = {
  todo: { label: "A fazer", Icon: Circle },
  inHold: { label: "Agendada", Icon: CircleDashed },
  doing: { label: "Em andamento", Icon: Clock3 },
  done: { label: "Concluída", Icon: CircleCheck },
  cancel: { label: "Cancelada", Icon: CircleSlash },
} satisfies Record<ExampleStatus, { label: string; Icon: typeof Circle }>;

export const priorityView: Record<ExamplePriority, string> = { urgent: "Urgente", medium: "Normal", low: "Flexível" };

export function TaskStatusIcon({ status }: { status: ExampleStatus }) {
  if (status === "doing") return (
    <svg viewBox="0 0 24 24" className={styles.taskStatusIcon} data-status={status} fill="none" stroke="currentColor" aria-hidden>
      <circle cx="12" cy="12" r="9" /><path d="M12 6a6 6 0 0 1 0 12Z" fill="currentColor" stroke="none" />
    </svg>
  );
  const { Icon } = statusView[status];
  return <Icon aria-hidden className={styles.taskStatusIcon} data-status={status} />;
}

export function TaskPriorityIcon({ priority, decorative = false }: { priority: ExamplePriority; decorative?: boolean }) {
  const icon = (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M3 12V9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M8 12V6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity={priority === "low" ? .25 : 1} />
      <path d="M13 12V3" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity={priority === "urgent" ? 1 : .25} />
    </svg>
  );

  if (decorative) return <span className={styles.taskPriority} data-priority={priority} aria-hidden>{icon}</span>;

  return (
    <span className={styles.taskPriority} data-priority={priority} role="img" aria-label={`Prioridade da tarefa: ${priorityView[priority]}`} title={`Prioridade da tarefa: ${priorityView[priority]}`}>
      {icon}
    </span>
  );
}

export interface SelectedTask { task: ExampleTask; dayKey: string }

export function TrackingDialog({ selected, tracking, missed, onTrackingChange, onMissedChange, onClose }: {
  selected: SelectedTask | null;
  tracking?: ExampleTracking;
  missed: boolean;
  onTrackingChange: (tracking: ExampleTracking) => void;
  onMissedChange: (missed: boolean) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (selected) dialogRef.current?.showModal();
  }, [selected]);

  return (
    <dialog ref={dialogRef} className={styles.taskDialog} aria-labelledby="task-task-title" onClose={onClose}
      onPointerDown={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialogRef.current?.close();
      }}>
      {selected ? <div className={styles.taskDialogContent}>
        <header className={styles.taskDialogHeading}>
          <div><p>{tracking ? <><Link2 aria-hidden />Tarefa vinculada · {tracking.id}</> : "Na sua agenda"}</p><h2 id="task-task-title">{selected.task.name}</h2></div>
          <button type="button" aria-label="Fechar detalhes" onClick={() => dialogRef.current?.close()}><X aria-hidden /></button>
        </header>
        {tracking ? <>
          <fieldset className={styles.statusOptions}>
            <legend>Status da tarefa</legend>
            {(Object.keys(statusView) as ExampleStatus[]).map((status) => (
              <label key={status} data-selected={status === tracking.status}>
                <input type="radio" name="task-status" value={status} checked={status === tracking.status} onChange={() => onTrackingChange({ ...tracking, status })} />
                <TaskStatusIcon status={status} /><span>{statusView[status].label}</span>
                {status === tracking.status ? <Check aria-hidden className={styles.selectedCheck} /> : null}
              </label>
            ))}
          </fieldset>
          <fieldset className={styles.priorityOptions}>
            <legend>Prioridade da tarefa</legend>
            {(Object.keys(priorityView) as ExamplePriority[]).map((priority) => (
              <label key={priority} data-selected={priority === tracking.priority}>
                <input type="radio" name="task-priority" aria-label={priorityView[priority]} value={priority} checked={priority === tracking.priority} onChange={() => onTrackingChange({ ...tracking, priority })} />
                <TaskPriorityIcon priority={priority} />{priorityView[priority]}
              </label>
            ))}
          </fieldset>
        </> : null}
        <section className={styles.taskAnnotation} aria-label="Anotação do evento">
          <h3>Este evento <span>{mediumDate(selected.dayKey)} · {selected.task.time}</span></h3>
          <label><input type="checkbox" checked={missed} onChange={(event) => onMissedChange(event.target.checked)} />Não realizado</label>
          <p>{tracking ? "A marca vale para este horário. O status e a prioridade pertencem à tarefa." : "Uma anotação sua sobre este horário."}</p>
        </section>
        <p className={styles.taskDemoNote}>Experimente à vontade · alterações apenas nesta prévia</p>
      </div> : null}
    </dialog>
  );
}
