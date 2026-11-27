"use client";

import type { AgentTaskStatus, TaskDto, TaskPriority, HumanTaskStatus } from "@repo/contracts";
import { TaskKindMark } from "@/components/tasks/task-kind-mark";
import { TaskPriorityMark, taskPriorityLabels } from "@/components/tasks/task-priority-mark";
import { TaskStatusGlyph, taskStatusName } from "@/components/tasks/task-status-glyph";
import { humanStatusOptions } from "@/lib/tasks/task-read-model";
import { TaskChoice } from "./TaskChoice";
import styles from "./task-detail.module.css";

/** A ordem das prioridades no seletor: da mais alta para a mais baixa. */
const PRIORITY_ORDER: TaskPriority[] = ["urgent", "high", "medium", "low"];

interface TaskDetailHeaderProps {
  task: TaskDto;
  busy: boolean;
  onStatusChange: (status: HumanTaskStatus) => void;
  onPriorityChange: (priority: TaskPriority) => void;
}

/**
 * O topo da tarefa: o código do tipo, o título, e o status e a prioridade.
 * Tarefa de pessoa troca os dois aqui, sem entrar em edição. Tarefa de agente
 * só mostra o status, solto na ponta direita; não mostra prioridade: quem
 * executa é o agente, e a API recusa a edição dele. Na tarefa de pessoa o status
 * fica no começo da linha e a prioridade na ponta direita, sem a moldura da
 * pílula. Tarefa "Só agenda" (sem status) não mostra nenhum dos dois: é só um
 * compromisso; para virar tarefa, o status entra pela edição.
 */
export function TaskDetailHeader({ task, busy, onStatusChange, onPriorityChange }: TaskDetailHeaderProps) {
  return (
    <header className={styles.header}>
      <TaskKindMark kind={task.kind} />
      <h1 className={styles.title}>{task.name}</h1>
      {task.status == null ? null : (
      <div className={styles.chips}>
        {task.actor === "human" ? (
          <HumanStatus task={task} busy={busy} onChange={onStatusChange} />
        ) : (
          <span className={styles.agentStatus}>
            <span aria-hidden className={styles.glyph}><TaskStatusGlyph actor="agent" status={task.status as AgentTaskStatus} size={16} /></span>
            {taskStatusName("agent", task.status as AgentTaskStatus)}
          </span>
        )}
        {task.actor === "human" ? (
          <div className={styles.priority}>
            <PriorityChoice task={task} busy={busy} onChange={onPriorityChange} />
          </div>
        ) : null}
      </div>
      )}
    </header>
  );
}

function HumanStatus({ task, busy, onChange }: { task: TaskDto; busy: boolean; onChange: (status: HumanTaskStatus) => void }) {
  const status = (task.status ?? null) as HumanTaskStatus | null;
  const label = taskStatusName("human", status);
  return (
    <TaskChoice<HumanTaskStatus>
      value={status}
      ariaLabel={`Status: ${label}. Trocar status de ${task.name}`}
      listLabel="Status da tarefa"
      disabled={busy}
      options={humanStatusOptions(task).map((value) => ({
        value,
        label: taskStatusName("human", value),
        icon: <TaskStatusGlyph actor="human" status={value} size={18} />,
      }))}
      trigger={
        <>
          <span aria-hidden className={styles.glyph}><TaskStatusGlyph actor="human" status={status} size={18} /></span>
          {label}
        </>
      }
      onChange={onChange}
    />
  );
}

function PriorityChoice({ task, busy, onChange }: { task: TaskDto; busy: boolean; onChange: (priority: TaskPriority) => void }) {
  const label = taskPriorityLabels[task.priority];
  return (
    <TaskChoice<TaskPriority>
      value={task.priority}
      ariaLabel={`Prioridade: ${label}. Trocar prioridade de ${task.name}`}
      listLabel="Prioridade da tarefa"
      disabled={busy}
      options={PRIORITY_ORDER.map((value) => ({ value, label: taskPriorityLabels[value], icon: <TaskPriorityMark priority={value} /> }))}
      trigger={
        <>
          <span aria-hidden className={styles.glyph}><TaskPriorityMark priority={task.priority} /></span>
          {label}
        </>
      }
      onChange={onChange}
    />
  );
}
