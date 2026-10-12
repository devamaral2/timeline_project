"use client";

import { X } from "lucide-react";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NotificationOffsetsField } from "@/components/events/edit-event-forms/shared";
import { TagInput } from "@/components/events/new-event-forms/TagInput";
import { iconButtonClass, outlineButtonClass, primaryButtonClass } from "@/components/ui/button-styles";
import { dialogHeaderClass, dialogOverlayClass, dialogPanelClass, dialogTitleClass } from "@/components/ui/dialog-styles";
import type { TaskDetailDto, WorkItemPriority, WorkItemStatus } from "@/lib/api/contracts";
import { createTask, updateTask } from "@/lib/tasks/task-api";
import {
  scheduleToInstants,
  statusForSchedule,
  TASK_PRIORITY_ORDER,
  TASK_STATUS_ORDER,
  taskDayOf,
  taskPriorityLabels,
  taskStatusLabels,
  taskTimeOf,
} from "@/lib/tasks/tasks-model";
import { cn } from "@/lib/utils";
import styles from "./tasks.module.css";

interface TaskEditorDialogProps {
  /** Ausente, o dialogo cria uma tarefa; presente, edita essa. */
  task?: TaskDetailDto;
  /** Ao criar uma subtarefa, a tarefa de que ela e filha. */
  parentTaskId?: string;
  onClose: () => void;
  /** Chamado depois que a API aceitou. Recebe o id da tarefa criada, quando for o caso. */
  onSaved: (taskId?: string) => void;
}

/**
 * Nova tarefa e editar tarefa, no mesmo formulario: nome na serifa, status e
 * prioridade lado a lado, dia e horario, detalhes. Com dia e horario, a tarefa
 * fica Agendada — a menos que a pessoa tenha escolhido o status.
 */
export function TaskEditorDialog({ task, parentTaskId, onClose, onSaved }: TaskEditorDialogProps) {
  const titleId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(task?.name ?? "");
  const [status, setStatus] = useState<WorkItemStatus>(task?.status ?? "todo");
  // Enquanto a pessoa nao mexe no status, ele acompanha o dia e o horario.
  const [statusChosen, setStatusChosen] = useState(Boolean(task));
  const [priority, setPriority] = useState<WorkItemPriority>(task?.priority ?? "medium");
  const [day, setDay] = useState(task ? (taskDayOf(task) ?? "") : "");
  const [time, setTime] = useState(task ? (taskTimeOf(task) ?? "") : "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [tags, setTags] = useState(task?.tags ?? []);
  const [offsets, setOffsets] = useState<number[]>(task?.notifyOffsetsMinutes ?? []);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A API nao tem como apagar uma data, so troca-la: quem ja tinha dia mantem o campo preenchido.
  const dayRequired = Boolean(task && taskDayOf(task));

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !submitting) onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, submitting]);

  function changeSchedule(nextDay: string, nextTime: string) {
    setDay(nextDay);
    setTime(nextTime);
    if (!statusChosen) setStatus(statusForSchedule(nextDay, nextTime));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Dê um nome à tarefa.");
      nameRef.current?.focus();
      return;
    }
    setSubmitting(true);
    setError(null);

    const fields = {
      name: name.trim(),
      description: description.trim(),
      status,
      priority,
      tags,
      notifyOffsetsMinutes: offsets,
      ...scheduleToInstants(day, time),
    };

    try {
      if (task) {
        await updateTask(task.id, { expectedRevision: task.revision, ...fields });
        onSaved();
      } else {
        const taskId = await createTask({ ...fields, parentTaskId });
        onSaved(taskId);
      }
    } catch {
      setError(task ? "Não foi possível salvar a tarefa. Tente novamente." : "Não foi possível criar a tarefa. Tente novamente.");
      setSubmitting(false);
    }
  }

  const heading = task ? "Editar tarefa" : parentTaskId ? "Nova subtarefa" : "Nova tarefa";

  return createPortal(
    <div
      className={dialogOverlayClass}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={(click) => {
        if (click.target === click.currentTarget && !submitting) onClose();
      }}
      onKeyDown={() => {}}
    >
      <div className={cn(dialogPanelClass, styles.dialog, "max-w-lg")}>
        <div className={dialogHeaderClass}>
          <h2 id={titleId} className={dialogTitleClass}>{heading}</h2>
          <button type="button" onClick={onClose} disabled={submitting} aria-label="Fechar" className={iconButtonClass}>
            <X aria-hidden className="size-4" />
          </button>
        </div>

        <form className={styles.form} onSubmit={(event) => void handleSubmit(event)} noValidate>
          <div className={styles.field}>
            <label htmlFor="task-name">Nome da tarefa</label>
            <input
              id="task-name"
              ref={nameRef}
              className={cn(styles.line, styles.nameField)}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nome da tarefa"
              autoComplete="off"
            />
          </div>

          <div className={styles.pair}>
            <div className={styles.field}>
              <label htmlFor="task-status">Status</label>
              <select
                id="task-status"
                className={styles.line}
                value={status}
                onChange={(event) => { setStatus(event.target.value as WorkItemStatus); setStatusChosen(true); }}
              >
                {TASK_STATUS_ORDER.map((option) => <option key={option} value={option}>{taskStatusLabels[option]}</option>)}
              </select>
            </div>
            <div className={styles.field}>
              <label htmlFor="task-priority">Prioridade</label>
              <select
                id="task-priority"
                className={styles.line}
                value={priority}
                onChange={(event) => setPriority(event.target.value as WorkItemPriority)}
              >
                {TASK_PRIORITY_ORDER.map((option) => <option key={option} value={option}>{taskPriorityLabels[option]}</option>)}
              </select>
            </div>
          </div>

          <div>
            <div className={styles.pair}>
              <div className={styles.field}>
                <label htmlFor="task-day">Dia</label>
                <input
                  id="task-day"
                  type="date"
                  className={styles.line}
                  value={day}
                  required={dayRequired}
                  onChange={(event) => changeSchedule(event.target.value, event.target.value ? time : "")}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="task-time">Horário</label>
                <input
                  id="task-time"
                  type="time"
                  className={styles.line}
                  value={time}
                  disabled={!day}
                  onChange={(event) => changeSchedule(day, event.target.value)}
                />
              </div>
            </div>
            <p className={styles.hint}>Com dia e horário, a tarefa fica Agendada.</p>
          </div>

          <div className={styles.field}>
            <label htmlFor="task-description">Detalhes</label>
            <textarea
              id="task-description"
              className={styles.line}
              rows={2}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Acrescente o que for importante…"
            />
          </div>

          <TagInput tags={tags} onTagsChange={setTags} />
          <NotificationOffsetsField value={offsets} onChange={setOffsets} />

          {error ? <p role="alert" className={styles.formError}>{error}</p> : null}

          <div className={styles.submitRow}>
            <button type="button" onClick={onClose} disabled={submitting} className={outlineButtonClass}>Cancelar</button>
            <button type="submit" disabled={submitting} className={primaryButtonClass}>
              {submitting ? "Salvando..." : task ? "Salvar" : "Criar tarefa"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
