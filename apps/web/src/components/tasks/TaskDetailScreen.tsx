"use client";

import { Copy, FileText, ListChecks, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { EntityAiEditBar } from "@/components/detail/EntityAiEditBar";
import {
  ActionPill, BackLink, DetailActions, DetailFact, DetailFacts, DetailFrame, DetailHeading, DetailMenu, DetailMessage,
  DetailNav, DetailOrigin, DetailSection, LinkGroup, LinkRow, MenuItem, Prose, Reminders, RelationRow,
  RowCard, StatusRow, TagPills, TaskStatusButton, TimeRange, detailIcon, detailStyles as styles,
} from "@/components/detail/detail-parts";
import { notificationOffsetLabel } from "@/components/events/event-visuals";
import { authedFetch } from "@/lib/api/authed-fetch";
import type { NoteDto, TaskDetailDto, TaskSummaryDto, WorkItemStatus } from "@/lib/api/contracts";
import { formatTime } from "@repo/timeline";
import { useNow } from "@/lib/events/use-now";
import { noteSnippet } from "@/lib/notes/notes-model";
import { createTask, updateTask } from "@/lib/tasks/task-api";
import {
  releasedBy,
  subtasksOf,
  taskDateLine,
  taskDayOf,
  taskStatusLabels,
  taskTimeOf,
  taskWhenLabel,
  toggledStatus,
} from "@/lib/tasks/tasks-model";
import { DeleteTaskDialog } from "./DeleteTaskDialog";
import { TaskPriorityMark, TaskStatusIcon } from "./task-visuals";

/** "hoje, 09:00" / "sex., 18 set.": o mesmo rotulo da lista, em minusculas, para ir depois do status. */
function lowerFirst(label: string): string {
  return label.charAt(0).toLocaleLowerCase("pt-BR") + label.slice(1);
}

/**
 * A tarefa aberta, em duas colunas. A esquerda o resumo: voltar, o dia em
 * mono, o nome na serifa, o status (toque para trocar) e a prioridade, o
 * horario, lembretes e tags, e as acoes (editar, duplicar, excluir — pilulas no
 * desktop, menu "mais acoes" no celular). A direita: descricao, de quem
 * depende, as subtarefas, o que ela libera, as notas e o campo do Hermes.
 */
export function TaskDetailScreen({ userId, taskId }: { userId: string; taskId: string }) {
  const router = useRouter();
  const now = useNow();
  const [task, setTask] = useState<TaskDetailDto | null>(null);
  const [all, setAll] = useState<TaskSummaryDto[]>([]);
  const [notes, setNotes] = useState<NoteDto[]>([]);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [subtaskName, setSubtaskName] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
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

  const noteIds = task?.noteIds;
  useEffect(() => {
    if (!noteIds?.length) {
      setNotes([]);
      return;
    }
    let cancelled = false;
    void Promise.all(noteIds.map((id) => authedFetch<NoteDto>(`/api/notes/${id}`).catch(() => null))).then((loaded) => {
      if (!cancelled) setNotes(loaded.filter((note): note is NoteDto => note !== null));
    });
    return () => { cancelled = true; };
  }, [noteIds]);

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
      <DetailFrame leadLabel="Resumo da tarefa" bodyLabel="Conteúdo da tarefa" lead={<DetailNav label="Navegação do registro" back={<BackLink href={listHref}>Tarefas</BackLink>} />}>
        <DetailMessage alert>Não foi possível carregar a tarefa. Tente novamente.</DetailMessage>
      </DetailFrame>
    );
  }
  if (!task) {
    return (
      <DetailFrame leadLabel="Resumo da tarefa" bodyLabel="Conteúdo da tarefa" lead={<DetailNav label="Navegação do registro" back={<BackLink href={listHref}>Tarefas</BackLink>} />}>
        <DetailMessage>Carregando tarefa…</DetailMessage>
      </DetailFrame>
    );
  }

  const byId = new Map(all.map((item) => [item.id, item]));
  const dependsOn = task.dependsOnTaskIds.map((id) => byId.get(id)).filter((item): item is TaskSummaryDto => item !== undefined);
  const subtasks = subtasksOf(task.id, all);
  const released = releasedBy(task.id, all);
  const hasDay = taskDayOf(task) !== null;
  const startTime = taskTimeOf(task);
  const endsAfterStart = Boolean(task.startedAt && task.estimatedFinishAt && task.estimatedFinishAt > task.startedAt);
  const endTime = startTime && endsAfterStart && task.estimatedFinishAt ? formatTime(task.estimatedFinishAt) : null;
  const durationMinutes = endTime && task.startedAt && task.estimatedFinishAt
    ? Math.round((new Date(task.estimatedFinishAt).getTime() - new Date(task.startedAt).getTime()) / 60_000)
    : null;
  const doneSubtasks = subtasks.filter((item) => item.status === "done").length;
  const closedTask = task.status === "done" || task.status === "cancel";

  function relationMeta(item: TaskSummaryDto): string {
    const label = taskStatusLabels[item.status];
    if (!now || taskDayOf(item) === null) return label;
    return `${label} · ${lowerFirst(taskWhenLabel(item, now))}`;
  }

  function renderRelation(item: TaskSummaryDto) {
    return <RelationRow key={item.id} href={`${listHref}/${item.id}`} name={item.name} status={item.status} meta={relationMeta(item)} />;
  }

  const parent = task.parentTaskId ? byId.get(task.parentTaskId) : undefined;
  const edit = () => router.push(`${listHref}/${task.id}/editar`);

  return (
    <DetailFrame
      leadLabel="Resumo da tarefa"
      bodyLabel="Conteúdo da tarefa"
      lead={
        <>
          <DetailNav
            label="Navegação do registro"
            back={<BackLink href={task.parentTaskId ? `${listHref}/${task.parentTaskId}` : listHref}>{task.parentTaskId ? (parent?.name ?? "Tarefa") : "Tarefas"}</BackLink>}
          >
            <DetailMenu label="Mais ações: editar, duplicar, excluir">
              {(close) => (
                <>
                  <MenuItem icon={<Pencil {...detailIcon} />} onClick={() => { close(); edit(); }}>Editar</MenuItem>
                  <MenuItem icon={<Copy {...detailIcon} />} onClick={() => { close(); void duplicate(); }}>Duplicar</MenuItem>
                  <MenuItem icon={<Trash2 {...detailIcon} />} danger onClick={() => { close(); setDeleting(true); }}>Excluir</MenuItem>
                </>
              )}
            </DetailMenu>
          </DetailNav>

          <DetailHeading eyebrow={taskDateLine(task)} done={closedTask}>{task.name}</DetailHeading>

          <StatusRow>
            <TaskStatusButton status={task.status} busy={busy} onChange={changeStatus} />
            <TaskPriorityMark priority={task.priority} withLabel alwaysLabel />
          </StatusRow>

          {hasDay ? <TimeRange start={startTime} end={endTime} minutes={durationMinutes} note="Sem horário definido" /> : null}

          {task.notifyOffsetsMinutes.length || task.tags.length ? (
            <DetailFacts label="Informações">
              {task.notifyOffsetsMinutes.length ? <DetailFact label={task.notifyOffsetsMinutes.length === 1 ? "Lembrete" : "Lembretes"}><Reminders labels={task.notifyOffsetsMinutes.map(notificationOffsetLabel)} /></DetailFact> : null}
              {task.tags.length ? <DetailFact label="Tags"><TagPills tags={task.tags} label="Tags da tarefa" /></DetailFact> : null}
            </DetailFacts>
          ) : null}

          <DetailActions>
            <ActionPill icon={<Pencil {...detailIcon} />} onClick={edit}>Editar</ActionPill>
            <ActionPill icon={<Copy {...detailIcon} />} disabled={busy} onClick={() => void duplicate()}>Duplicar</ActionPill>
            <ActionPill icon={<Trash2 {...detailIcon} />} danger onClick={() => setDeleting(true)}>Excluir</ActionPill>
          </DetailActions>
        </>
      }
    >
        {task.description ? <DetailSection title="Descrição" labelId="tk-description"><Prose>{task.description}</Prose></DetailSection> : null}

        {actionError ? <DetailMessage alert>{actionError}</DetailMessage> : null}

        {dependsOn.length ? (
          <DetailSection title="Depende de" labelId="tk-depends">
            <RowCard>{dependsOn.map(renderRelation)}</RowCard>
          </DetailSection>
        ) : null}

        <DetailSection title="Subtarefas" labelId="tk-sub" count={subtasks.length ? `${doneSubtasks} de ${subtasks.length}` : undefined}>
          <ul className={styles.card}>
            {subtasks.map((subtask) => {
              const closed = subtask.status === "done" || subtask.status === "cancel";
              return (
                <li key={subtask.id} className={styles.subtask}>
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
                  <span><Plus {...detailIcon} /></span>Adicionar subtarefa
                </button>
              )}
            </li>
          </ul>
        </DetailSection>

        {released.length ? (
          <DetailSection title="Libera" labelId="tk-releases">
            <RowCard>{released.map(renderRelation)}</RowCard>
          </DetailSection>
        ) : null}

        {notes.length ? (
          <DetailSection title="Vínculos" labelId="tk-links" className="links">
            <LinkGroup id="tk-links-notes" title="Notas vinculadas" count={notes.length}>
              {notes.map((note) => (
                <LinkRow key={note.id} kind="note" icon={<FileText {...detailIcon} />} title={note.name} sub={`Nota${noteSnippet(note) ? ` · ${noteSnippet(note)}` : ""}`} href={`/${userId}/notas/${note.id}`} />
              ))}
            </LinkGroup>
          </DetailSection>
        ) : null}

        <DetailOrigin id="task" />

        <EntityAiEditBar
          userId={userId}
          entityType="task"
          entityId={task.id}
          onEdited={() => setReloadKey((key) => key + 1)}
          context={{
            icon: <ListChecks aria-hidden />,
            meta: now && hasDay ? `Tarefa · ${lowerFirst(taskWhenLabel(task, now))}` : `Tarefa · ${lowerFirst(taskStatusLabels[task.status])}`,
            title: task.name,
          }}
        />

      {deleting ? (
        <DeleteTaskDialog
          taskId={task.id}
          taskName={task.name}
          subtaskCount={subtasks.length}
          onClose={() => setDeleting(false)}
          onDeleted={() => router.push(listHref)}
        />
      ) : null}
    </DetailFrame>
  );
}
