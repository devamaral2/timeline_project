"use client";

import { ChevronDown, Clock, Link2, ListChecks, SlidersHorizontal, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { authedFetch } from "@/lib/api/authed-fetch";
import type { TaskSummaryDto, WorkItemStatus } from "@/lib/api/contracts";
import { useNow } from "@/lib/events/use-now";
import { tagAccentStyle, tagColorStyle } from "@/lib/tags/tag-color";
import { updateTask } from "@/lib/tasks/task-api";
import {
  groupTasks,
  isOverdueTask,
  isTodayTask,
  overdueLabel,
  pendingDependencies,
  subtaskProgress,
  type TaskSort,
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

/** Quanto o aviso de "Concluída" fica na tela antes de sumir. */
const TOAST_MS = 5000;

interface Toast {
  message: string;
  undo: () => void;
}

/**
 * Tarefas agrupadas por status: as abertas na ordem do design e, no fim,
 * Concluídas e Canceladas recolhidas. Busca pelo nome, filtro por tags e, dentro
 * de cada grupo, prioridade e depois data (ou o inverso).
 */
export function TasksScreen({ userId }: { userId: string }) {
  const now = useNow();
  const [tasks, setTasks] = useState<TaskSummaryDto[] | null>(null);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [sort, setSort] = useState<TaskSort>("priority");
  const [optionsOpen, setOptionsOpen] = useState(false);
  const optionsRef = useRef<HTMLDivElement>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<WorkItemStatus[]>([]);
  const [pending, setPending] = useState<string[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadKey força o refetch.
  useEffect(() => {
    let cancelled = false;
    setError(false);
    void authedFetch<TaskSummaryDto[]>("/api/tasks")
      .then((data) => { if (!cancelled) setTasks(data); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!optionsOpen) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) { if (event.key === "Escape") setOptionsOpen(false); return; }
      if (!optionsRef.current?.contains(event.target as Node)) setOptionsOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [optionsOpen]);

  const retry = useCallback(() => {
    setTasks(null);
    setReloadKey((key) => key + 1);
  }, []);

  const allTags = useMemo(
    () => [...new Set((tasks ?? []).flatMap((task) => task.tags))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [tasks],
  );
  const visible = useMemo(
    () => (tasks ?? []).filter((task) =>
      (selectedTags.length === 0 || task.tags.some((tag) => selectedTags.includes(tag)))),
    [tasks, selectedTags],
  );
  const groups = useMemo(() => groupTasks(visible, sort), [visible, sort]);
  const hasTasks = tasks ? topLevelTasks(tasks).length > 0 : false;
  const filtered = selectedTags.length > 0;

  function clearFilters() {
    setSelectedTags([]);
  }

  /** Muda o status com a revisão da lista; devolve se a API aceitou. */
  async function applyStatus(target: Pick<TaskSummaryDto, "id" | "revision">, status: WorkItemStatus): Promise<boolean> {
    setActionError(null);
    setPending((current) => [...current, target.id]);
    try {
      await updateTask(target.id, { expectedRevision: target.revision, status });
      setTasks((current) => current?.map((item) => item.id === target.id ? { ...item, status, revision: target.revision + 1 } : item) ?? current);
      return true;
    } catch {
      setActionError("Não foi possível atualizar a tarefa. Tente novamente.");
      // A revisão pode ter andado em outra aba: recarregar traz a atual.
      setReloadKey((key) => key + 1);
      return false;
    } finally {
      setPending((current) => current.filter((id) => id !== target.id));
    }
  }

  async function toggle(task: TaskSummaryDto) {
    const previous = task.status;
    const status = toggledStatus(task);
    if (!(await applyStatus(task, status))) return;
    setToast({
      message: `${status === "done" ? "Concluída" : "Reaberta"}: ${task.name}`,
      // A revisão que a API acabou de devolver é a seguinte à da lista.
      undo: () => { setToast(null); void applyStatus({ id: task.id, revision: task.revision + 1 }, previous); },
    });
  }

  return (
    <main id="conteudo" className={styles.screen}>
      <header className={styles.pageHead}>
        <h1 className={styles.title}>Tarefas</h1>
        {hasTasks ? (
          <div className={styles.options} ref={optionsRef}>
            <button
              type="button"
              className={styles.optionsButton}
              aria-label="Opções de visualização"
              title="Opções de visualização"
              aria-expanded={optionsOpen}
              aria-haspopup="dialog"
              onClick={() => setOptionsOpen((open) => !open)}
            >
              <SlidersHorizontal aria-hidden />
              {selectedTags.length > 0 ? <span className={styles.optionsBadge} aria-label={`${selectedTags.length} filtros ativos`}>{selectedTags.length}</span> : null}
            </button>
            {optionsOpen ? (
              <div className={styles.optionsPanel} role="dialog" aria-label="Opções de visualização">
                <label className={styles.sort}>
                  Ordenar por
                  <select className={styles.select} value={sort} onChange={(event) => setSort(event.target.value as TaskSort)}>
                    <option value="priority">Prioridade</option>
                    <option value="date">Data</option>
                  </select>
                </label>
                {allTags.length > 0 ? (
                  <fieldset className={styles.chips} aria-label="Filtrar por tag">
                    {allTags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        className={styles.chip}
                        aria-pressed={selectedTags.includes(tag)}
                        onClick={() => setSelectedTags((current) => toggleIn(current, tag))}
                      >
                        <span className={styles.dot} style={tagAccentStyle(tag)} aria-hidden="true" />#{tag}
                      </button>
                    ))}
                  </fieldset>
                ) : null}
                <button type="button" className={styles.optionsClear} onClick={clearFilters} disabled={selectedTags.length === 0}>Limpar filtros</button>
              </div>
            ) : null}
          </div>
        ) : null}
      </header>

      {actionError ? <p role="alert" className={styles.message}>{actionError}</p> : null}

      {error ? (
        <p role="alert" className={styles.message}>Não foi possível carregar as tarefas.<button type="button" className={styles.retry} onClick={retry}>Tentar de novo</button></p>
      ) : !tasks || !now ? (
        <div className={styles.groups} aria-busy="true"><p role="status" className={styles.message}>Carregando tarefas…</p></div>
      ) : !hasTasks ? (
        <div className={styles.empty}>
          <ListChecks aria-hidden />
          <h2 className={styles.emptyTitle}>Nenhuma tarefa por aqui</h2>
          <p className={styles.emptyText}>Crie a primeira tarefa para começar a organizar o seu dia.</p>
          <button type="button" className={styles.emptyAction} onClick={() => setCreating(true)}>Nova tarefa</button>
        </div>
      ) : groups.length === 0 ? (
        <div className={styles.empty}>
          <ListChecks aria-hidden />
          <h2 className={styles.emptyTitle}>Nenhuma tarefa encontrada</h2>
          <p className={styles.emptyText}>
            {filtered
              ? "Nada combina com a busca e os filtros atuais. Remova um filtro para ver mais tarefas."
              : "Não há tarefas para mostrar."}
          </p>
          <button type="button" className={styles.emptyAction} onClick={clearFilters}>Limpar filtros</button>
        </div>
      ) : (
        <div className={styles.groups}>
          {groups.map((group) => {
            const labelId = `tarefas-${group.status}`;
            const open = !group.collapsedByDefault || expanded.includes(group.status);
            return (
              <section key={group.status} aria-labelledby={labelId} className={styles.group}>
                <h2 id={labelId} className={styles.groupHead} data-status={group.status}>
                  {group.collapsedByDefault ? (
                    <button type="button" className={styles.groupToggle} aria-expanded={open} onClick={() => setExpanded((current) => toggleIn(current, group.status))}>
                      <ChevronDown aria-hidden />
                      <span className={styles.groupTitle}>{group.title}</span>
                      <span className={styles.groupCount}>{group.tasks.length}</span>
                    </button>
                  ) : (
                    <>
                      <span className={styles.groupTitle}>{group.title}</span>
                      <span className={styles.groupCount}>{group.tasks.length}</span>
                    </>
                  )}
                </h2>
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
      )}

      {toast ? (
        <div className={styles.toast} role="status" aria-live="polite">
          <span className={styles.toastMessage}>{toast.message}</span>
          <button type="button" className={styles.toastUndo} onClick={toast.undo}>Desfazer</button>
        </div>
      ) : null}

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
  const today = isTodayTask(task, now);
  const hasDay = taskDayOf(task) !== null;
  const when = overdue ? overdueLabel(task, now) : taskWhenLabel(task, now);
  const closed = task.status === "done" || task.status === "cancel";
  const action = closed ? "reabrir" : "concluir";

  return (
    <li className={styles.row} data-status={task.status} data-pending={pending}>
      <button
        type="button"
        className={styles.rowCheck}
        data-status={task.status}
        disabled={pending}
        aria-label={`${taskStatusLabels[task.status]}. Toque para ${action} “${task.name}”`}
        title={taskStatusLabels[task.status]}
        onClick={onToggle}
      >
        <TaskStatusIcon status={task.status} size={24} />
      </button>

      <div className={styles.main}>
        <Link href={href} className={styles.name} title={task.name}>{task.name}</Link>
        {task.tags.length > 0 || waiting > 0 || progress ? (
          <ul className={styles.meta}>
            {task.tags.map((tag) => (
              <li key={tag} className={styles.tag} style={tagColorStyle(tag)}>#{tag}</li>
            ))}
            {waiting > 0 ? <li className={styles.waiting}><Link2 aria-hidden />{waitingLabel(waiting)}</li> : null}
            {progress ? (
              <li className={styles.progress} role="img" aria-label={`${progress.done} de ${progress.total} subtarefas feitas`}>
                <span className={styles.progressBar} aria-hidden="true"><i style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} /></span>
                <span className={styles.progressCount} aria-hidden="true">{progress.done}/{progress.total}</span>
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>

      <div className={styles.side}>
        {closed ? null : <TaskPriorityMark priority={task.priority} withLabel alwaysLabel />}
        {hasDay ? (
          <span className={cn(styles.due, overdue && styles.dueLate, !overdue && today && styles.dueToday)}>
            {overdue ? <TriangleAlert aria-hidden /> : today ? <Clock aria-hidden /> : null}
            {when}
          </span>
        ) : null}
      </div>
    </li>
  );
}
