"use client";

import { ChevronDown, Link2, ListChecks, Plus, SlidersHorizontal, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { authedFetch } from "@/lib/api/authed-fetch";
import type { TaskSummaryDto, WorkItemStatus } from "@/lib/api/contracts";
import { useNow } from "@/lib/events/use-now";
import { tagColorStyle } from "@/lib/tags/tag-color";
import { updateTask } from "@/lib/tasks/task-api";
import {
  countLabel,
  groupTasks,
  isOverdueTask,
  overdueCountLabel,
  overdueLabel,
  pendingDependencies,
  subtaskProgress,
  type TaskSort,
  taskCounts,
  taskDayOf,
  taskStatusLabels,
  taskWhenLabel,
  toggledStatus,
  topLevelTasks,
  waitingLabel,
} from "@/lib/tasks/tasks-model";
import { cn } from "@/lib/utils";
import { TaskEditorDialog } from "./TaskEditorDialog";
import { TaskPriorityMark, TaskStatusIcon } from "./task-visuals";
import styles from "./tasks.module.css";

function toggleIn<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

/** Tarefas agrupadas por status: as abertas na ordem do design e, no fim, Concluídas e Canceladas recolhidas. */
export function TasksScreen({ userId }: { userId: string }) {
  const now = useNow();
  const [tasks, setTasks] = useState<TaskSummaryDto[] | null>(null);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [sort, setSort] = useState<TaskSort>("date");
  const [hiddenTags, setHiddenTags] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<WorkItemStatus[]>([]);
  const [pending, setPending] = useState<string[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadKey força o refetch.
  useEffect(() => {
    let cancelled = false;
    setError(false);
    void authedFetch<TaskSummaryDto[]>("/api/tasks")
      .then((data) => { if (!cancelled) setTasks(data); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  const retry = useCallback(() => {
    setTasks(null);
    setReloadKey((key) => key + 1);
  }, []);

  const allTags = useMemo(
    () => [...new Set((tasks ?? []).flatMap((task) => task.tags))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [tasks],
  );
  const visible = useMemo(
    () => (tasks ?? []).filter((task) => task.tags.length === 0 ? true : task.tags.some((tag) => !hiddenTags.includes(tag))),
    [tasks, hiddenTags],
  );
  const groups = useMemo(() => groupTasks(visible, sort), [visible, sort]);
  const counts = tasks && now ? taskCounts(tasks, now) : null;

  async function toggle(task: TaskSummaryDto) {
    const status = toggledStatus(task);
    setActionError(null);
    setPending((current) => [...current, task.id]);
    try {
      await updateTask(task.id, { expectedRevision: task.revision, status });
      setTasks((current) => current?.map((item) => item.id === task.id ? { ...item, status, revision: item.revision + 1 } : item) ?? current);
    } catch {
      setActionError("Não foi possível atualizar a tarefa. Tente novamente.");
      // A revisão pode ter andado em outra aba: recarregar traz a atual.
      setReloadKey((key) => key + 1);
    } finally {
      setPending((current) => current.filter((id) => id !== task.id));
    }
  }

  return (
    <main id="conteudo" className={styles.screen}>
      <div className={styles.heading}>
        <div className={styles.titleBlock}>
          <p className={styles.count} aria-live="polite">
            {counts ? (
              <>
                <span>{countLabel(counts.open)}</span>
                {counts.overdue > 0 ? <><span aria-hidden="true">·</span><span className={styles.overdue}>{overdueCountLabel(counts.overdue)}</span></> : null}
              </>
            ) : " "}
          </p>
          <h1 className={styles.title}>Tarefas</h1>
        </div>
        <div className={styles.headingActions}>
          <details className={styles.options} onKeyDown={(event) => {
            if (event.key === "Escape") { event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); }
          }} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false; }}>
            <summary className={styles.roundButton} aria-label="Filtrar e ordenar" title="Filtrar e ordenar"><SlidersHorizontal aria-hidden /></summary>
            <div className={styles.optionsPanel}>
              <fieldset>
                <legend>Ordenar por</legend>
                <label><input type="radio" name="task-sort" checked={sort === "date"} onChange={() => setSort("date")} /><span>Data</span></label>
                <label><input type="radio" name="task-sort" checked={sort === "priority"} onChange={() => setSort("priority")} /><span>Prioridade</span></label>
              </fieldset>
              <fieldset>
                <legend>Tags exibidas</legend>
                {allTags.length === 0 ? <p>Nenhuma tag disponível.</p> : allTags.map((tag) => (
                  <label key={tag}>
                    <input type="checkbox" checked={!hiddenTags.includes(tag)} onChange={() => setHiddenTags((current) => toggleIn(current, tag))} />
                    <span>#{tag}</span>
                  </label>
                ))}
              </fieldset>
            </div>
          </details>
          <button type="button" className={styles.createButton} onClick={() => setCreating(true)}><Plus aria-hidden />Nova tarefa</button>
        </div>
      </div>

      {actionError ? <p role="alert" className={styles.message}>{actionError}</p> : null}

      {error ? (
        <p role="alert" className={styles.message}>Não foi possível carregar as tarefas.<button type="button" className={styles.retry} onClick={retry}>Tentar de novo</button></p>
      ) : !tasks || !now ? (
        <div className={styles.groups} aria-busy="true"><p role="status" className={styles.message}>Carregando tarefas…</p></div>
      ) : topLevelTasks(tasks).length === 0 ? (
        <p className={styles.message}>Você ainda não tem tarefas.</p>
      ) : groups.length === 0 ? (
        <p className={styles.message}>Nenhuma tarefa com as tags selecionadas. Escolha as tags no menu de opções.</p>
      ) : (
        <div>
          <div className={styles.columns} aria-hidden="true">
            <span /><span>Tarefa</span><span>Tags</span><span>Quando</span><span>Prioridade</span>
          </div>
          <div className={styles.groups}>
            {groups.map((group) => {
              const labelId = `tarefas-${group.status}`;
              const open = !group.collapsedByDefault || expanded.includes(group.status);
              const heading = (
                <h2 id={labelId} className={styles.groupTitle} data-status={group.status}>
                  <TaskStatusIcon status={group.status} />
                  {group.title}
                  <span className={styles.groupCount}>{group.tasks.length}</span>
                </h2>
              );
              return (
                <section key={group.status} aria-labelledby={labelId} className={cn(styles.group, group.collapsedByDefault && styles.closed)}>
                  {group.collapsedByDefault ? (
                    <button type="button" className={styles.closedToggle} aria-expanded={open} onClick={() => setExpanded((current) => toggleIn(current, group.status))}>
                      {heading}
                      <span className={styles.chevron}><ChevronDown aria-hidden /></span>
                    </button>
                  ) : heading}
                  {open ? (
                    <ul className={styles.list}>
                      {group.tasks.map((task) => (
                        <TaskRow
                          key={task.id}
                          task={task}
                          tasks={tasks}
                          now={now}
                          href={`/${userId}/tarefas/${task.id}`}
                          pending={pending.includes(task.id)}
                          onToggle={() => void toggle(task)}
                        />
                      ))}
                    </ul>
                  ) : null}
                </section>
              );
            })}
          </div>
        </div>
      )}

      {creating ? (
        <TaskEditorDialog
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); retry(); }}
        />
      ) : null}
    </main>
  );
}

interface TaskRowProps {
  task: TaskSummaryDto;
  tasks: readonly TaskSummaryDto[];
  now: Date;
  href: string;
  pending: boolean;
  onToggle: () => void;
}

function TaskRow({ task, tasks, now, href, pending, onToggle }: TaskRowProps) {
  const progress = subtaskProgress(task.id, tasks);
  const waiting = pendingDependencies(task, tasks).length;
  const overdue = isOverdueTask(task, now);
  const hasDay = taskDayOf(task) !== null;
  const when = overdue ? overdueLabel(task, now) : taskWhenLabel(task, now);
  const closed = task.status === "done" || task.status === "cancel";
  const action = closed ? "reabrir" : "concluir";

  return (
    <li className={styles.row} data-status={task.status} data-pending={pending}>
      <button
        type="button"
        className={styles.check}
        data-status={task.status}
        disabled={pending}
        aria-label={`${taskStatusLabels[task.status]}. Toque para ${action} “${task.name}”`}
        title={taskStatusLabels[task.status]}
        onClick={onToggle}
      >
        <TaskStatusIcon status={task.status} size={22} />
      </button>

      <div className={styles.main}>
        <Link href={href} className={styles.name}>{task.name}</Link>
        <ul className={styles.meta}>
          {hasDay ? (
            <li className={cn(styles.onlyMobile, overdue && styles.late)}>
              {overdue ? <TriangleAlert aria-hidden /> : null}
              {when}
            </li>
          ) : null}
          {waiting > 0 ? <li><Link2 aria-hidden />{waitingLabel(waiting)}</li> : null}
          {progress ? (
            <li role="img" aria-label={`${progress.done} de ${progress.total} subtarefas feitas`}>
              <ListChecks aria-hidden />{progress.done}/{progress.total}
            </li>
          ) : null}
          {task.tags.map((tag) => (
            <li key={tag} className={cn(styles.chip, styles.onlyMobile)} style={tagColorStyle(tag)}>#{tag}</li>
          ))}
        </ul>
      </div>

      <ul className={cn(styles.tags, styles.onlyDesktop)} aria-label="Tags">
        {task.tags.map((tag) => <li key={tag} style={tagColorStyle(tag)}>#{tag}</li>)}
      </ul>
      <div className={cn(styles.when, styles.onlyDesktop)}>
        {overdue ? <span className={styles.late}><TriangleAlert aria-hidden />{when}</span> : when}
      </div>
      <TaskPriorityMark priority={task.priority} withLabel />
    </li>
  );
}
