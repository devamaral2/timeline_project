"use client";

import { ArrowLeft, Bell, Check, ChevronDown, ChevronRight, Copy, Ellipsis, Hash, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";
import shellStyles from "@/app/mockups/eventos/mockup.module.css";
import { ICON_STROKE_WIDTH, notificationOffsetLabel } from "@/components/events/event-visuals";
import { authedFetch } from "@/lib/api/authed-fetch";
import type { TaskDetailDto, TaskSummaryDto, WorkItemStatus } from "@/lib/api/contracts";
import { useNow } from "@/lib/events/use-now";
import { tagColorStyle } from "@/lib/tags/tag-color";
import { createTask, updateTask } from "@/lib/tasks/task-api";
import {
  releasedBy,
  subtasksOf,
  TASK_STATUS_ORDER,
  taskDateLine,
  taskDayOf,
  taskStatusLabels,
  taskTimeLine,
  taskWhenLabel,
  toggledStatus,
} from "@/lib/tasks/tasks-model";
import { cn } from "@/lib/utils";
import { DeleteTaskDialog } from "./DeleteTaskDialog";
import { TaskEditorDialog } from "./TaskEditorDialog";
import { TaskPriorityMark, TaskStatusIcon } from "./task-visuals";
import styles from "./tasks.module.css";

const icon = { "aria-hidden": true, strokeWidth: ICON_STROKE_WIDTH } as const;

/** "hoje, 09:00" / "sex., 18 set.": o mesmo rotulo da lista, em minusculas, para ir depois do status. */
function lowerFirst(label: string): string {
  return label.charAt(0).toLocaleLowerCase("pt-BR") + label.slice(1);
}

/**
 * A tarefa aberta: nome, status (toque para trocar) e prioridade, dia e hora,
 * lembretes, tags, descricao e as tres relacoes — de quem depende, as
 * subtarefas e o que ela libera. Nao ha botao de concluir nem de editar: o
 * status muda no seletor e a edicao fica no menu "···".
 */
export function TaskDetailScreen({ userId, taskId }: { userId: string; taskId: string }) {
  const router = useRouter();
  const now = useNow();
  const [task, setTask] = useState<TaskDetailDto | null>(null);
  const [all, setAll] = useState<TaskSummaryDto[]>([]);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [subtaskName, setSubtaskName] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const listHref = `/${userId}/tarefas`;

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadKey força o refetch após cada mudança.
  useEffect(() => {
    let cancelled = false;
    setError(false);
    void Promise.all([
      authedFetch<TaskDetailDto>(`/api/tasks/${taskId}`),
      authedFetch<TaskSummaryDto[]>("/api/tasks"),
    ])
      .then(([detail, summaries]) => {
        if (cancelled) return;
        setTask(detail);
        setAll(summaries);
      })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [taskId, reloadKey]);

  useEffect(() => {
    if (!menuOpen && !statusOpen) return;
    function close(event: Event) {
      if (event instanceof KeyboardEvent) {
        if (event.key === "Escape") { setMenuOpen(false); setStatusOpen(false); }
        return;
      }
      const target = event.target as Node;
      if (!menuRef.current?.contains(target)) setMenuOpen(false);
      if (!statusRef.current?.contains(target)) setStatusOpen(false);
    }
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [menuOpen, statusOpen]);

  /** Roda uma escrita e recarrega; a falha vira o aviso da tela. */
  async function run(action: () => Promise<void>, failure: string) {
    setBusy(true);
    setActionError(null);
    try {
      await action();
      setReloadKey((key) => key + 1);
    } catch {
      setActionError(failure);
      // A revisão pode ter andado em outra aba: recarregar traz a atual.
      setReloadKey((key) => key + 1);
    } finally {
      setBusy(false);
    }
  }

  function changeStatus(status: WorkItemStatus) {
    setStatusOpen(false);
    if (!task || status === task.status) return;
    void run(() => updateTask(task.id, { expectedRevision: task.revision, status }), "Não foi possível trocar o status. Tente novamente.");
  }

  function toggleSubtask(subtask: TaskSummaryDto) {
    void run(
      () => updateTask(subtask.id, { expectedRevision: subtask.revision, status: toggledStatus(subtask) }),
      "Não foi possível atualizar a subtarefa. Tente novamente.",
    );
  }

  function addSubtask(event: FormEvent) {
    event.preventDefault();
    const name = subtaskName.trim();
    if (!task || !name) return;
    void run(async () => {
      await createTask({ name, parentTaskId: task.id });
      setSubtaskName("");
      setAddingSubtask(false);
    }, "Não foi possível adicionar a subtarefa. Tente novamente.");
  }

  async function duplicate() {
    if (!task) return;
    setMenuOpen(false);
    setBusy(true);
    setActionError(null);
    try {
      const copyId = await createTask({
        name: `${task.name} (cópia)`,
        description: task.description,
        status: task.status === "done" || task.status === "cancel" ? "todo" : task.status,
        priority: task.priority,
        tags: task.tags,
        notifyOffsetsMinutes: task.notifyOffsetsMinutes,
        startedAt: task.startedAt,
        estimatedFinishAt: task.estimatedFinishAt,
        parentTaskId: task.parentTaskId,
      });
      router.push(`${listHref}/${copyId}`);
    } catch {
      setActionError("Não foi possível duplicar a tarefa. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <main id="conteudo" className={shellStyles.detailMain}>
        <div className={styles.detail}>
          <Link href={listHref} className={styles.backLink}><ArrowLeft {...icon} />Tarefas</Link>
          <p role="alert" className={styles.message}>Não foi possível carregar a tarefa. Tente novamente.</p>
        </div>
      </main>
    );
  }
  if (!task) {
    return <main id="conteudo" className={shellStyles.detailMain}><p role="status" className={styles.message}>Carregando tarefa…</p></main>;
  }

  const byId = new Map(all.map((item) => [item.id, item]));
  const dependsOn = task.dependsOnTaskIds.map((id) => byId.get(id)).filter((item): item is TaskSummaryDto => item !== undefined);
  const subtasks = subtasksOf(task.id, all);
  const released = releasedBy(task.id, all);
  const timeLine = taskTimeLine(task);
  const doneSubtasks = subtasks.filter((item) => item.status === "done").length;

  function relationMeta(item: TaskSummaryDto): string {
    const label = taskStatusLabels[item.status];
    if (!now || taskDayOf(item) === null) return label;
    return `${label} · ${lowerFirst(taskWhenLabel(item, now))}`;
  }

  function renderRelation(item: TaskSummaryDto) {
    return (
      <li key={item.id}>
        <Link href={`${listHref}/${item.id}`} className={styles.relation} data-status={item.status}>
          <span className={styles.relationIcon} role="img" aria-label={taskStatusLabels[item.status]}><TaskStatusIcon status={item.status} size={20} /></span>
          <span className={styles.relationText}>
            <span className={styles.relationName}>{item.name}</span>
            <span className={styles.relationMeta}>{relationMeta(item)}</span>
          </span>
          <ChevronRight {...icon} />
        </Link>
      </li>
    );
  }

  return (
    <main id="conteudo" className={shellStyles.detailMain}>
      <div className={styles.detail}>
        <nav className={styles.navigation} aria-label="Tarefa">
          <Link href={task.parentTaskId ? `${listHref}/${task.parentTaskId}` : listHref} className={styles.backLink}>
            <ArrowLeft {...icon} />{task.parentTaskId ? (byId.get(task.parentTaskId)?.name ?? "Tarefa") : "Tarefas"}
          </Link>
          <div className={styles.anchor} ref={menuRef}>
            <button type="button" className={styles.iconButton} aria-label="Mais ações: editar, duplicar, excluir" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}><Ellipsis {...icon} /></button>
            {menuOpen ? (
              <div role="menu" className={styles.menu}>
                <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setEditing(true); }}><Pencil {...icon} />Editar</button>
                <button type="button" role="menuitem" onClick={() => void duplicate()}><Copy {...icon} />Duplicar</button>
                <button type="button" role="menuitem" data-danger="true" onClick={() => { setMenuOpen(false); setDeleting(true); }}><Trash2 {...icon} />Excluir</button>
              </div>
            ) : null}
          </div>
        </nav>

        <header className={styles.header}>
          <h1>{task.name}</h1>
          <div className={styles.statusRow}>
            <div className={styles.anchor} ref={statusRef}>
              <button
                type="button"
                className={styles.statusButton}
                data-status={task.status}
                aria-haspopup="listbox"
                aria-expanded={statusOpen}
                aria-label={`Status: ${taskStatusLabels[task.status]}. Trocar status`}
                disabled={busy}
                onClick={() => setStatusOpen((open) => !open)}
              >
                <TaskStatusIcon status={task.status} />
                <span>{taskStatusLabels[task.status]}</span>
                <ChevronDown className={styles.caret} {...icon} />
              </button>
              {statusOpen ? (
                <div role="listbox" aria-label="Status da tarefa" className={cn(styles.menu, styles.statusMenu)}>
                  {TASK_STATUS_ORDER.map((status) => (
                    <button key={status} type="button" role="option" aria-selected={status === task.status} data-status={status} onClick={() => changeStatus(status)}>
                      <TaskStatusIcon status={status} />
                      {taskStatusLabels[status]}
                      {status === task.status ? <Check className={styles.selectedMark} {...icon} /> : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <TaskPriorityMark priority={task.priority} withLabel />
          </div>
          <div className={styles.dateLines}>
            <p>{taskDateLine(task)}</p>
            {timeLine ? <p>{timeLine}</p> : null}
          </div>
        </header>

        {task.notifyOffsetsMinutes.length || task.tags.length ? (
          <section className={styles.info} aria-label="Informações">
            {task.notifyOffsetsMinutes.length ? (
              <div>
                <Bell {...icon} />
                <ul className={styles.reminders} aria-label="Lembretes">
                  {task.notifyOffsetsMinutes.map((minutes) => <li key={minutes}>{notificationOffsetLabel(minutes)}</li>)}
                </ul>
              </div>
            ) : null}
            {task.tags.length ? (
              <div>
                <Hash {...icon} />
                <ul aria-label="Tags da tarefa">
                  {task.tags.map((tag) => <li key={tag} style={tagColorStyle(tag)}>#{tag}</li>)}
                </ul>
              </div>
            ) : null}
          </section>
        ) : null}

        {task.description ? <p className={styles.prose}>{task.description}</p> : null}

        {actionError ? <p role="alert" className={styles.message}>{actionError}</p> : null}

        {dependsOn.length ? (
          <section aria-label="Depende de">
            <div className={styles.sectionLabel}><h2>Depende de</h2></div>
            <ul className={styles.card}>{dependsOn.map(renderRelation)}</ul>
          </section>
        ) : null}

        <section aria-label="Subtarefas">
          <div className={styles.sectionLabel}>
            <h2>Subtarefas</h2>
            {subtasks.length ? <span>{doneSubtasks} de {subtasks.length}</span> : null}
          </div>
          <ul className={styles.card}>
            {subtasks.map((subtask) => {
              const closed = subtask.status === "done" || subtask.status === "cancel";
              return (
                <li key={subtask.id} className={styles.subtask} data-status={subtask.status}>
                  <button
                    type="button"
                    className={styles.check}
                    data-status={subtask.status}
                    disabled={busy}
                    aria-label={`${taskStatusLabels[subtask.status]}. Toque para ${closed ? "reabrir" : "concluir"} “${subtask.name}”`}
                    onClick={() => toggleSubtask(subtask)}
                  >
                    <TaskStatusIcon status={subtask.status} size={20} />
                  </button>
                  <Link href={`${listHref}/${subtask.id}`} className={styles.subtaskName} data-done={closed}>{subtask.name}</Link>
                </li>
              );
            })}
            <li>
              {addingSubtask ? (
                <form className={styles.subtaskForm} onSubmit={addSubtask}>
                  <input
                    aria-label="Nome da subtarefa"
                    placeholder="Nome da subtarefa"
                    value={subtaskName}
                    onChange={(event) => setSubtaskName(event.target.value)}
                    // biome-ignore lint/a11y/noAutofocus: o campo nasce de um toque em "Adicionar subtarefa".
                    autoFocus
                  />
                  <button type="submit" disabled={busy || !subtaskName.trim()}>Adicionar</button>
                  <button type="button" onClick={() => { setAddingSubtask(false); setSubtaskName(""); }}>Cancelar</button>
                </form>
              ) : (
                <button type="button" className={styles.addSubtask} onClick={() => setAddingSubtask(true)}>
                  <span><Plus {...icon} /></span>Adicionar subtarefa
                </button>
              )}
            </li>
          </ul>
        </section>

        {released.length ? (
          <section aria-label="Libera">
            <div className={styles.sectionLabel}><h2>Libera</h2></div>
            <ul className={styles.card}>{released.map(renderRelation)}</ul>
          </section>
        ) : null}
      </div>

      {editing ? <TaskEditorDialog task={task} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); setReloadKey((key) => key + 1); }} /> : null}
      {deleting ? (
        <DeleteTaskDialog
          taskId={task.id}
          taskName={task.name}
          subtaskCount={subtasks.length}
          onClose={() => setDeleting(false)}
          onDeleted={() => router.push(listHref)}
        />
      ) : null}
    </main>
  );
}
