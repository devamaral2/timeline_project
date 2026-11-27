"use client";

import { useRef, useState } from "react";
import type { TaskDto } from "@repo/contracts";
import { agendaRefreshEvent } from "@/components/agenda/agenda-refresh";
import { DetailFrame, DetailMessage } from "@/components/detail/detail-parts";
import { EditBar, EditFieldSection, EditFooter, editStyles as edit } from "@/components/edit/edit-parts";
import { EditTagSection } from "@/components/edit/EditTagSection";
import { ApiRequestError } from "@/lib/api/client-request";
import { createTask, newIdempotencyKey, updateTask } from "@/lib/api/tasks";
import { createRecurrence, editRecurrence } from "@/lib/api/recurrences";
import { buildCreateTaskInput, buildTaskPatch, type TaskDraftErrors, validateTaskDraft } from "./task-draft";
import {
  type RecurrenceErrors,
  browserTimeZone,
  buildCreateRecurrenceInput,
  planSeriesEdit,
  scheduleAfterTask,
  validateNewRecurrence,
  validateSeriesEdit,
} from "./task-recurrence-draft";
import { TaskEditArtifactsSection } from "./TaskEditArtifactsSection";
import { TaskEditHeaderFields } from "./TaskEditHeaderFields";
import { TaskEditInfoSection } from "./TaskEditInfoSection";
import { TaskEditLocationSection } from "./TaskEditLocationSection";
import { TaskEditPersistentSection } from "./TaskEditPersistentSection";
import { TaskEditProjectField } from "./TaskEditProjectField";
import { TaskEditRecurrenceSection } from "./TaskEditRecurrenceSection";
import { TaskEditReminderSection } from "./TaskEditReminderSection";
import { TaskEditHierarchySection } from "./TaskEditHierarchySection";
import { useTaskDraft } from "./use-task-draft";
import { useRecurrenceDraft } from "./use-recurrence-draft";

interface TaskEditViewProps {
  /** A tarefa lida. Sem ele, o formulário é de criação: começa vazio e cria uma tarefa nova. */
  task?: TaskDto;
  /** O dono da tela: os pedidos ao Hermes saem em nome dele. */
  userId?: string;
  /** O título de uma tarefa nova, vindo de `/tarefa comprar pão`. */
  initialName?: string;
  /** Relê a tarefa depois de uma revisão velha. Não lança. */
  onReload?: () => Promise<void>;
  /** Volta para a tela de onde a pessoa veio, depois de salvar ou de descartar. */
  onLeave: () => void;
}

const STALE_MESSAGE = "Esta tarefa mudou em outro lugar. Carregamos a versão atual; confira o que você digitou e salve de novo.";
const REFUSED_MESSAGE = "A API recusou alguma entrada. Confira os campos e tente de novo.";
const FAILED_MESSAGE = "Não foi possível salvar a tarefa. Tente novamente.";
const CREATE_FAILED_MESSAGE = "Não foi possível criar a tarefa. Tente novamente.";

/**
 * O formulário da tarefa de pessoa, na edição e na criação, no desenho do quadro
 * "Detalhe · edição": o topo só com o rótulo, o resumo (tipo, título, status e
 * prioridade), uma coluna de seções e o rodapé de Descartar e Salvar. O estado
 * mora num só lugar (`useTaskDraft`); cada seção lê e escreve os seus campos.
 * Uma seção nova entra no corpo do formulário, antes do rodapé, e os campos
 * dela no `TaskDraft` e em `buildTaskPatch` (e em `buildCreateTaskInput`, se
 * a criação os enviar).
 */
export function TaskEditView({ task: loaded, userId, initialName, onReload, onLeave }: TaskEditViewProps) {
  const { task, draft, setField } = useTaskDraft(loaded ?? null, initialName);
  // A recorrência é outra chamada, com a revisão da série: o rascunho dela fica fora do `TaskDraft`.
  const recurrence = useRecurrenceDraft(task?.recurrence?.id ?? null);
  const [recurrenceErrors, setRecurrenceErrors] = useState<RecurrenceErrors>({});
  const [errors, setErrors] = useState<TaskDraftErrors>({});
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  // A criação usa a mesma chave enquanto o formulário estiver aberto: tocar em Salvar de novo não cria outra tarefa.
  const [idempotencyKey] = useState(newIdempotencyKey);
  // A guarda vale antes da próxima renderização: dois toques seguidos não mandam duas requisições.
  const busy = useRef(false);

  async function save() {
    if (busy.current) return;
    const problems = validateTaskDraft(draft);
    // Sem série (a criação, ou uma tarefa avulso que vai virar recorrente) Salvar cria a série; a tarefa avulso fica
    // como está e a série começa no dia seguinte. Com série, vale a troca da regra; a tarefa persistente não se repete.
    const joining = task !== null && !task.recurrence;
    const seriesSchedule = joining ? scheduleAfterTask(draft) : draft;
    const startsSeries = (!task || joining) && recurrence.draft !== null && !draft.longRunning;
    const ruleProblems: RecurrenceErrors = startsSeries && recurrence.draft
      ? validateNewRecurrence(recurrence.draft, seriesSchedule)
      : task && recurrence.series && recurrence.draft && !draft.longRunning ? validateSeriesEdit(recurrence.series, recurrence.draft) : {};
    setErrors(problems);
    setRecurrenceErrors(ruleProblems);
    if (Object.keys(problems).length > 0 || Object.keys(ruleProblems).length > 0) return;

    const patch = task ? buildTaskPatch(task, draft, new Date()) : null;
    const seriesPatch = task && recurrence.series && recurrence.draft && !draft.longRunning
      ? planSeriesEdit(recurrence.series, recurrence.draft)
      : null;
    const newSeries = startsSeries && recurrence.draft ? buildCreateRecurrenceInput(recurrence.draft, seriesSchedule, browserTimeZone()) : null;
    if (task && !patch && !seriesPatch && !newSeries) {
      onLeave();
      return;
    }

    busy.current = true;
    setSaving(true);
    setFailure(null);
    try {
      if (task) {
        // A série vai primeiro: se a API recusar a regra, a tarefa fica como estava. A mesma chave a cada toque em
        // Salvar: se a série saiu e a tarefa não, a nova tentativa não cria uma segunda.
        if (newSeries) await createRecurrence(newSeries, { idempotencyKey });
        if (seriesPatch && recurrence.series) await editRecurrence(recurrence.series.id, seriesPatch);
        if (patch) await updateTask(task.id, patch);
      } else if (newSeries) {
        await createRecurrence(newSeries, { idempotencyKey });
      } else {
        // Sem local digitado, a tarefa nasce sem local: a posição da pessoa nunca é enviada.
        await createTask(buildCreateTaskInput(draft, new Date()), { idempotencyKey });
      }
      window.dispatchEvent(new Event(agendaRefreshEvent));
      onLeave();
    } catch (cause) {
      busy.current = false;
      setSaving(false);
      if (cause instanceof ApiRequestError && cause.kind === "stale_revision") {
        await onReload?.();
        await recurrence.reloadSeries();
        setFailure(STALE_MESSAGE);
      } else {
        setFailure(failureMessage(cause, task !== null));
      }
    }
  }

  return (
    <DetailFrame
      type={draft.kind}
      edit
      leadLabel="Resumo da tarefa"
      bodyLabel="Conteúdo da tarefa"
      lead={
        <>
          <EditBar>{task ? "Editar tarefa" : "Nova tarefa"}</EditBar>
          <TaskEditHeaderFields draft={draft} errors={errors} onChange={setField} />
        </>
      }
    >
      <form
        className={edit.form}
        aria-label="Campos da tarefa"
        noValidate
        onSubmit={(submit) => {
          submit.preventDefault();
          void save();
        }}
      >
        <TaskEditInfoSection draft={draft} errors={errors} onChange={setField}>
          <TaskEditProjectField draft={draft} onChange={setField} />
          {/* A tarefa persistente só existe na edição: a criação ainda não a envia. */}
          {task ? <TaskEditPersistentSection draft={draft} onChange={setField} /> : null}
          {/* A recorrência não aparece com a tarefa persistente: a tarefa longa não se repete. */}
          {draft.longRunning ? null : (
            <TaskEditRecurrenceSection
              task={task}
              draft={draft}
              recurrence={recurrence}
              errors={recurrenceErrors}
              onSeriesDeleted={() => {
                window.dispatchEvent(new Event(agendaRefreshEvent));
                void onReload?.();
                void recurrence.reloadSeries();
              }}
            />
          )}
          <TaskEditReminderSection draft={draft} noDeadline={draft.longRunning && !draft.endDate} error={errors.reminders} onChange={setField} />
        </TaskEditInfoSection>
        <TaskEditLocationSection value={draft.location} error={errors.location} onChange={(location) => setField("location", location)} />
        <EditTagSection tags={draft.tags} labelId="task-edit-tags" listLabel="Tags da tarefa" onChange={(tags) => setField("tags", tags)} />
        <EditFieldSection title="Descrição" labelId="task-edit-description">
          <textarea
            id="task-description"
            aria-labelledby="task-edit-description"
            className={edit.textarea}
            rows={4}
            value={draft.description}
            onChange={(change) => setField("description", change.target.value)}
          />
        </EditFieldSection>
        {/* A hierarquia (tarefa principal e subtarefas) só existe na edição: a criação ainda não a mostra. */}
        {task ? <TaskEditHierarchySection taskId={task.id} userId={userId} draft={draft} onChange={setField} /> : null}
        {/* A lista de artefatos só existe na edição: a criação ainda não a mostra. */}
        {task ? <TaskEditArtifactsSection draft={draft} onChange={setField} /> : null}
        {failure ? <DetailMessage alert>{failure}</DetailMessage> : null}
        <EditFooter saving={saving} onDiscard={onLeave} />
      </form>
    </DetailFrame>
  );
}

/** A recusa da API vira a mensagem de entrada; o resto, a geral de quem edita ou de quem cria. */
function failureMessage(cause: unknown, editing: boolean): string {
  if (cause instanceof ApiRequestError && cause.kind === "invalid_input") return REFUSED_MESSAGE;
  return editing ? FAILED_MESSAGE : CREATE_FAILED_MESSAGE;
}
