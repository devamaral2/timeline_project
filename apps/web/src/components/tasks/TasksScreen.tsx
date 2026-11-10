"use client";

import { Check, ChevronDown, Clock, Link2, ListChecks, SlidersHorizontal, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { authedFetch } from "@/lib/api/authed-fetch";
import type { TaskSummaryDto, WorkItemStatus } from "@/lib/api/contracts";
import { useNow } from "@/lib/events/use-now";
import page from "@/components/ui/page.module.css";
import { tagAccentStyle } from "@/lib/tags/tag-color";
import { updateTask } from "@/lib/tasks/task-api";
import {
  groupTasks,
  isOverdueTask,
  isTodayTask,
  overdueCountLabel,
  overdueLabel,
  pendingDependencies,
  subtaskProgress,
  taskCounts,
  type TaskSort,
  taskDayOf,
  taskGroupLabels,
  taskStatusLabels,
  taskWhenLabel,
  todayCountLabel,
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

/** "9 tarefas abertas": a legenda em mono no topo da tela. */
function openTasksLabel(open: number): string {
  if (open === 0) return "Nenhuma tarefa aberta";
  return open === 1 ? "1 tarefa aberta" : `${open} tarefas abertas`;
}

const MONTH_SHORT = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" });

/** O dia da tarefa como o número e o mês curto ("13" e "set"), para a coluna da direita. */
function dayFigure(dayKey: string): { day: string; month: string } {
  return { day: String(Number(dayKey.slice(8, 10))), month: MONTH_SHORT.format(new Date(`${dayKey}T12:00:00Z`)).replace(".", "") };
}

const sortLabels: Record<TaskSort, string> = { priority: "Prioridade", date: "Data" };
const sortHints: Record<TaskSort, string> = { priority: "As mais urgentes primeiro", date: "As mais próximas primeiro" };
const SORTS: readonly TaskSort[] = ["priority", "date"];

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

  const counts = tasks && now ? taskCounts(tasks, now) : null;
  const allGroups = useMemo(() => groupTasks(tasks ?? [], sort), [tasks, sort]);

  /** Os chips de tag: no desktop ficam na coluna esquerda; no celular, dentro do painel de opções. */
  const tagFilter = allTags.length > 0 ? (
    <div className={styles.tagFilter}>
      <p className={styles.tagLabel}>Filtrar por tag</p>
      <fieldset className={styles.tagChips} aria-label="Filtrar por tag">
        {allTags.map((tag) => (
          <button key={tag} type="button" className={styles.tagChip} aria-pressed={selectedTags.includes(tag)} onClick={() => setSelectedTags((current) => toggleIn(current, tag))}>
            <i style={tagAccentStyle(tag)} aria-hidden="true" />#{tag}
          </button>
        ))}
      </fieldset>
      {filtered ? <button type="button" className={styles.clear} onClick={clearFilters}>Limpar filtros</button> : null}
    </div>
  ) : null;

  return (
    <main id="conteudo" className={page.frame}>
      <section className={`${page.lead} ${styles.lead}`} aria-label="Resumo das tarefas">
        <div className={styles.headRow}>
          <h1 className={page.eyebrow}>{counts ? openTasksLabel(counts.open) : "Tarefas"}</h1>
          {hasTasks ? (
            <div className={styles.phoneOptions} ref={optionsRef}>
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
                {filtered ? <span className={styles.optionsBadge}>{selectedTags.length}<span className="sr-only"> filtros ativos</span></span> : null}
              </button>
              {optionsOpen ? (
                <div className={styles.optionsPanel} role="dialog" aria-label="Opções de visualização">
                  <p className={styles.optionsLabel}>Ordenar por</p>
                  {SORTS.map((value) => (
                    <button key={value} type="button" className={styles.optionsSort} aria-pressed={sort === value} onClick={() => setSort(value)}>
                      <span className={styles.optionsText}><strong>{sortLabels[value]}</strong><small>{sortHints[value]}</small></span>
                      {sort === value ? <Check aria-hidden /> : null}
                    </button>
                  ))}
                  {tagFilter}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {hasTasks ? (
          <nav className={styles.groupNav} aria-label="Grupos de tarefas">
            <ul>
              {allGroups.map(({ status, tasks: groupTasksList, collapsedByDefault }) => (
                <li key={status}>
                  <a href={`#tarefas-${status}`} data-closed={collapsedByDefault} onClick={() => { if (collapsedByDefault) setExpanded((current) => current.includes(status) ? current : [...current, status]); }}>
                    <TaskStatusIcon status={status} />
                    <span>{taskGroupLabels[status]}</span>
                    <strong>{groupTasksList.length}</strong>
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}

        {optionsOpen ? null : tagFilter}
      </section>

      <section className={`${page.body} ${styles.body}`} aria-label="Lista de tarefas">
        {hasTasks ? (
          <div className={styles.toolbar}>
            <fieldset className={styles.sortGroup} aria-label="Ordenar por">
              <span aria-hidden="true">Ordenar por</span>
              {SORTS.map((value) => (
                <button key={value} type="button" className={styles.sortPill} aria-pressed={sort === value} onClick={() => setSort(value)}>{sortLabels[value]}</button>
              ))}
            </fieldset>
            {counts && (counts.overdue > 0 || counts.today > 0) ? (
              <p className={styles.summary}>
                {counts.overdue > 0 ? <span className={styles.summaryLate}>{overdueCountLabel(counts.overdue)}</span> : null}
                {counts.overdue > 0 && counts.today > 0 ? <span aria-hidden="true">·</span> : null}
                {counts.today > 0 ? <span>{todayCountLabel(counts.today)}</span> : null}
              </p>
            ) : null}
          </div>
        ) : null}

        {actionError ? <p role="alert" className={styles.message}>{actionError}</p> : null}

        {error ? (
          <p role="alert" className={styles.message}>Não foi possível carregar as tarefas.<button type="button" className={styles.retry} onClick={retry}>Tentar de novo</button></p>
        ) : !tasks || !now ? (
          <div aria-busy="true"><p role="status" className={styles.message}>Carregando tarefas…</p></div>
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
                ? "Nada combina com os filtros atuais. Remova um filtro para ver mais tarefas."
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
                <section key={group.status} id={labelId} aria-labelledby={`${labelId}-titulo`} className={styles.group}>
                  {group.collapsedByDefault ? (
                    <h2 id={`${labelId}-titulo`} className={styles.groupHead} data-collapsible="true">
                      <button type="button" className={styles.groupToggle} aria-expanded={open} onClick={() => setExpanded((current) => toggleIn(current, group.status))}>
                        <ChevronDown aria-hidden />{group.title}<span>{group.tasks.length}</span>
                      </button>
                    </h2>
                  ) : (
                    <h2 id={`${labelId}-titulo`} className={styles.groupHead}>{group.title}<span>{group.tasks.length}</span></h2>
                  )}
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
      </section>

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

  const day = taskDayOf(task);
  const figure = day ? dayFigure(day) : null;

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
        <TaskStatusIcon status={task.status} size={22} />
      </button>

      <div className={styles.main}>
        <h3 className={styles.name}><Link href={href} title={task.name}>{task.name}</Link></h3>
        {hasDay || task.tags.length > 0 || waiting > 0 || progress ? (
          <ul className={styles.meta}>
            {hasDay ? (
              <li className={cn(overdue && styles.whenLate, !overdue && today && styles.whenToday)}>
                {overdue ? <TriangleAlert aria-hidden /> : today ? <Clock aria-hidden /> : null}
                {when}
              </li>
            ) : null}
            {task.tags.map((tag) => (
              <li key={tag} style={tagAccentStyle(tag)}>#{tag}</li>
            ))}
            {waiting > 0 ? <li><Link2 aria-hidden />{waitingLabel(waiting)}</li> : null}
            {progress ? (
              <li className={styles.progress} role="img" aria-label={`${progress.done} de ${progress.total} subtarefas feitas`}>
                <span className={styles.progressBar} aria-hidden="true"><i style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} /></span>
                <span aria-hidden="true">{progress.done}/{progress.total}</span>
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>

      <div className={styles.side}>
        {figure ? <p className={cn(styles.date, overdue && styles.dateLate)} aria-hidden="true">{figure.day}<small>{figure.month}</small></p> : null}
        {closed ? null : <TaskPriorityMark priority={task.priority} withLabel alwaysLabel />}
      </div>
    </li>
  );
}
