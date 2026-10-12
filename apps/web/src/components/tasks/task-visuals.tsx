import type { WorkItemPriority, WorkItemStatus } from "@/lib/api/contracts";
import { taskPriorityBars, taskPriorityLabels } from "@/lib/tasks/tasks-model";
import styles from "./tasks.module.css";

/**
 * O status e sempre um circulo so, e o que fica dentro diz qual: vazio (a
 * fazer), relogio (agendada), tracejado (a definir), pausa (em espera), check
 * (concluida) e barra (cancelada). A cor sai do `data-status` no CSS.
 */
export function TaskStatusIcon({ status, size = 18, className }: { status: WorkItemStatus; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-status={status}
      className={className ?? styles.statusIcon}
    >
      <circle cx="12" cy="12" r="9" strokeDasharray={status === "toDefine" ? "2.4 2.31" : undefined} />
      {status === "scheduled" ? <path d="M12 7.5V12l3 1.8" /> : null}
      {status === "inHold" ? <><path d="M10 9v6" /><path d="M14 9v6" /></> : null}
      {status === "done" ? <path d="m8.5 12.2 2.4 2.4 4.6-4.9" /> : null}
      {status === "cancel" ? <path d="m9 15 6-6" /> : null}
    </svg>
  );
}

/** As tres barras da prioridade: quantas acendem dizem o quanto. Urgente e a unica em vermelho. */
export function TaskPriorityMark({ priority, withLabel = false }: { priority: WorkItemPriority; withLabel?: boolean }) {
  const lit = taskPriorityBars[priority];
  const label = `Prioridade: ${taskPriorityLabels[priority]}`;
  return (
    <span role="img" aria-label={label} title={label} className={styles.priority} data-priority={priority}>
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className={styles.priorityBars}>
        <path d="M3 13V10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M8 13V7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity={lit >= 2 ? 1 : 0.22} />
        <path d="M13 13V4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity={lit >= 3 ? 1 : 0.22} />
      </svg>
      {withLabel ? <span className={styles.priorityText}>{taskPriorityLabels[priority]}</span> : null}
    </span>
  );
}
