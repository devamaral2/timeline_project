"use client";

import type { TaskPriority, HumanTaskKind, HumanTaskStatus } from "@repo/contracts";
import { EditCaret, EditSelect, editStyles as edit } from "@/components/edit/edit-parts";
import { TaskKindMark } from "@/components/tasks/task-kind-mark";
import { TaskPriorityMark, taskPriorityLabels } from "@/components/tasks/task-priority-mark";
import { TaskStatusGlyph, taskStatusName } from "@/components/tasks/task-status-glyph";
import { visualForItemType } from "@/components/tasks/task-visuals";
import { humanStatusOptions } from "@/lib/tasks/task-read-model";
import type { TaskDraft, TaskDraftErrors, TaskDraftField } from "./task-draft";

/** Os tipos de evento de pessoa, na ordem do quadro Tipos. */
const KINDS: HumanTaskKind[] = ["common", "meal", "sleep", "training"];
/** A prioridade da mais alta para a mais baixa, como no seletor da leitura. */
const PRIORITY_ORDER: TaskPriority[] = ["urgent", "high", "medium", "low"];
/** O valor do `<select>` para "sem status": o rascunho guarda `null`. */
const NO_STATUS = "";

interface TaskEditHeaderFieldsProps {
  draft: TaskDraft;
  errors: TaskDraftErrors;
  onChange: <K extends TaskDraftField>(field: K, value: TaskDraft[K]) => void;
}

/**
 * O resumo do formulário, como no quadro "Detalhe · edição": a pílula do tipo
 * (ícone e código em mono), o título como campo na serifa, e a linha com o
 * status (glifo, nome e código) e a prioridade (barras e nome). O status
 * "Sem status" vale só para evento que não é longo (o longo sempre tem status).
 * O que vale é o rascunho: a tarefa persistente ligada agora já muda as opções.
 */
export function TaskEditHeaderFields({ draft, errors, onChange }: TaskEditHeaderFieldsProps) {
  const statuses = humanStatusOptions({ longRunning: draft.longRunning });
  const statusOptions: { value: string; label: string }[] = statuses.map((status) => ({ value: status, label: taskStatusName("human", status) }));
  if (!draft.longRunning) statusOptions.push({ value: NO_STATUS, label: "Sem status" });

  return (
    <div className={edit.summary}>
      <div className={edit.summaryRow}>
        <EditSelect<HumanTaskKind>
          id="task-kind"
          label="Tipo"
          pill
          value={draft.kind}
          options={KINDS.map((kind) => ({ value: kind, label: visualForItemType(kind).label }))}
          onChange={(kind) => onChange("kind", kind)}
        >
          <span className={edit.kindBox}><TaskKindMark kind={draft.kind} size={16} /></span>
          <EditCaret />
        </EditSelect>
      </div>

      <input
        id="task-name"
        type="text"
        aria-label="Título"
        placeholder="Título do evento"
        autoComplete="off"
        className={edit.titleInput}
        value={draft.name}
        aria-invalid={errors.name ? true : undefined}
        aria-describedby={errors.name ? "task-name-error" : undefined}
        onChange={(change) => onChange("name", change.target.value)}
      />
      {errors.name ? <p id="task-name-error" className={edit.error}>{errors.name}</p> : null}

      <div className={edit.choices}>
        <EditSelect<string>
          id="task-status"
          label="Status"
          value={draft.status ?? NO_STATUS}
          options={statusOptions}
          invalid={Boolean(errors.status)}
          describedBy={errors.status ? "task-status-error" : undefined}
          onChange={(value) => onChange("status", value === NO_STATUS ? null : (value as HumanTaskStatus))}
        >
          <span className={edit.statusGlyph}><TaskStatusGlyph actor="human" status={draft.status} size={28} /></span>
          <span className={edit.statusText}>
            <span className={`${edit.statusName} ${edit.tone}`} data-tone={draft.status ?? "reference"}>
              {taskStatusName("human", draft.status)}
              <EditCaret />
            </span>
            <span className={edit.statusCode}>{draft.status ?? "sem status"}</span>
          </span>
        </EditSelect>

        <EditSelect<TaskPriority>
          id="task-priority"
          label="Prioridade"
          value={draft.priority}
          options={PRIORITY_ORDER.map((priority) => ({ value: priority, label: taskPriorityLabels[priority] }))}
          onChange={(priority) => onChange("priority", priority)}
        >
          <span className={edit.priorityBox}><TaskPriorityMark priority={draft.priority} /></span>
          <span className={`${edit.priorityName} ${edit.tone}`} data-tone={draft.priority}>
            {taskPriorityLabels[draft.priority]}
            <EditCaret />
          </span>
        </EditSelect>
      </div>
      {errors.status ? <p id="task-status-error" className={edit.error}>{errors.status}</p> : null}
    </div>
  );
}
