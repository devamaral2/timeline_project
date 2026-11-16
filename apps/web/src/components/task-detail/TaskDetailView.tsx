"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import type { TaskDto, TaskPriority, HumanTaskStatus } from "@repo/contracts";
import { agendaRefreshEvent } from "@/components/agenda/agenda-refresh";
import { BackLink, DetailFrame, DetailMenu, DetailMessage, MenuItem, detailIcon } from "@/components/detail/detail-parts";
import { EntityAiEditBar } from "@/components/detail/EntityAiEditBar";
import { DeleteTaskDialog } from "@/components/tasks/DeleteTaskDialog";
import { visualForItemType } from "@/components/tasks/task-visuals";
import { useMotionRouter } from "@/components/shell/navigation-motion";
import { ApiRequestError } from "@/lib/api/client-request";
import { type EditTaskInput, updateTask } from "@/lib/api/tasks";
import { momentLabel, priorityPatch, statusPatch } from "@/lib/tasks/task-read-model";
import { TaskArtifactsSection } from "./TaskArtifactsSection";
import { TaskDetailHeader } from "./TaskDetailHeader";
import { TaskInfoSection } from "./TaskInfoSection";
import { TaskRequestsSection } from "./TaskRequestsSection";
import { TaskSequenceSection } from "./TaskSequenceSection";
import styles from "./task-detail.module.css";

interface TaskDetailViewProps {
  userId: string;
  task: TaskDto;
  /** Relê a tarefa depois de uma troca. Não lança: a falha fica com a tela que o carregou. */
  onChanged: () => Promise<void>;
}

const STALE_MESSAGE = "Esta tarefa mudou em outro lugar. Carregamos a versão atual; confira e tente de novo.";

/**
 * O detalhe de tarefa em modo de leitura, a rota única para agenda e lista de
 * tarefas. A tela é uma coluna de seções separadas: o topo (este arquivo e
 * `TaskDetailHeader`), as Informações (`TaskInfoSection`), e as seções de
 * relação: Sequência (`TaskSequenceSection`) Artefatos (`TaskArtifactsSection`) e Pedidos (`TaskRequestsSection`: criado e atualizado por). "Excluir" fica no menu "Mais ações" do
 * topo, ao lado de "Editar" (ticket 23).
 */
export function TaskDetailView({ userId, task, onChanged }: TaskDetailViewProps) {
  const router = useMotionRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const editHref = `/${userId}/tarefas/${task.id}/editar`;
  const visual = visualForItemType(task.kind);
  const TypeIcon = visual.Icon;

  /** Manda a troca com a revisão lida. Revisão velha: relê a tarefa e avisa, sem gravar nada. */
  async function change(patch: EditTaskInput, failure: string) {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await updateTask(task.id, patch);
      window.dispatchEvent(new Event(agendaRefreshEvent));
      await onChanged();
    } catch (cause) {
      if (cause instanceof ApiRequestError && cause.kind === "stale_revision") {
        await onChanged();
        setError(STALE_MESSAGE);
      } else {
        setError(failure);
      }
    } finally {
      setSaving(false);
    }
  }

  const changeStatus = (status: HumanTaskStatus) =>
    change(statusPatch(task, status, new Date()), "Não foi possível trocar o status. Tente novamente.");
  const changePriority = (priority: TaskPriority) =>
    change(priorityPatch(task, priority), "Não foi possível trocar a prioridade. Tente novamente.");

  const lead = (
    <>
      <nav className={styles.topbar} aria-label="Navegação do registro">
        <BackLink href={`/${userId}`} label="Voltar para a Agenda" />
        <span className={styles.topbarTitle}>Tarefa</span>
        <div className={styles.topbarActions}>
          <DetailMenu label="Mais ações">
            {(close) => (
              <>
                <MenuItem icon={<Pencil {...detailIcon} />} onClick={() => { close(); router.push(editHref); }}>Editar</MenuItem>
                <MenuItem icon={<Trash2 {...detailIcon} />} danger onClick={() => { close(); setConfirmingDelete(true); }}>Excluir</MenuItem>
              </>
            )}
          </DetailMenu>
        </div>
      </nav>
      <TaskDetailHeader task={task} busy={saving} onStatusChange={changeStatus} onPriorityChange={changePriority} />
    </>
  );

  return (
    <DetailFrame type={task.kind} leadLabel="Resumo da tarefa" bodyLabel="Conteúdo da tarefa" lead={lead}>
      <TaskInfoSection task={task} />
      <TaskSequenceSection userId={userId} task={task} />
      <TaskArtifactsSection userId={userId} task={task} />
      <TaskRequestsSection userId={userId} task={task} />
      {error ? <DetailMessage alert>{error}</DetailMessage> : null}
      <EntityAiEditBar
        userId={userId}
        entityType="task"
        entityId={task.id}
        onEdited={() => {
          window.dispatchEvent(new Event(agendaRefreshEvent));
          void onChanged();
        }}
        context={{
          icon: <TypeIcon aria-hidden />,
          meta: task.startedAt ? `Tarefa · ${momentLabel(task.startedAt)}` : "Tarefa",
          title: task.name,
        }}
      />
      {confirmingDelete ? (
        <DeleteTaskDialog
          taskId={task.id}
          taskName={task.name}
          onClose={() => setConfirmingDelete(false)}
          onDeleted={() => {
            window.dispatchEvent(new Event(agendaRefreshEvent));
            router.back();
          }}
        />
      ) : null}
    </DetailFrame>
  );
}
