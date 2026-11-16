"use client";

import { currentCoordinates } from "@/lib/geolocation/current-coordinates";
import { useRef, useState } from "react";
import type { TaskDto } from "@repo/contracts";
import { agendaRefreshEvent } from "@/components/agenda/agenda-refresh";
import { DetailFrame, DetailMessage } from "@/components/detail/detail-parts";
import { EditBar, EditFieldSection, EditFooter, editStyles as edit } from "@/components/edit/edit-parts";
import { EditTagSection } from "@/components/edit/EditTagSection";
import { ApiRequestError } from "@/lib/api/client-request";
import { createEvent, newIdempotencyKey, updateEvent } from "@/lib/api/events";
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
import { TaskEditRecurrenceSection } from "./TaskEditRecurrenceSection";
import { TaskEditReminderSection } from "./TaskEditReminderSection";
import { TaskEditSequenceSection } from "./TaskEditSequenceSection";
import { useTaskDraft } from "./use-task-draft";
import { useRecurrenceDraft } from "./use-recurrence-draft";

interface TaskEditViewProps {
  /** O evento lido. Sem ele, o formulário é de criação: começa vazio e cria um evento novo. */
  task?: TaskDto;
  /** O título de um evento novo, vindo de `/evento comprar pão`. */
  initialName?: string;
  /** Relê o evento depois de uma revisão velha. Não lança. */
  onReload?: () => Promise<void>;
  /** Volta para a tela de onde a pessoa veio, depois de salvar ou de descartar. */
  onLeave: () => void;
}

const STALE_MESSAGE = "Este evento mudou em outro lugar. Carregamos a versão atual; confira o que você digitou e salve de novo.";
const REFUSED_MESSAGE = "A API recusou alguma entrada. Confira os campos e tente de novo.";
const FAILED_MESSAGE = "Não foi possível salvar o evento. Tente novamente.";
const CREATE_FAILED_MESSAGE = "Não foi possível criar o evento. Tente novamente.";

/**
 * O formulário do evento de pessoa, na edição e na criação, no desenho do quadro
 * "Detalhe · edição": o topo só com o rótulo, o resumo (tipo, título, status e
 * prioridade), uma coluna de seções e o rodapé de Descartar e Salvar. O estado
 * mora num só lugar (`useTaskDraft`); cada seção lê e escreve os seus campos.
 * Uma seção nova entra no corpo do formulário, antes do rodapé, e os campos
 * dela no `TaskDraft` e em `buildTaskPatch` (e em `buildCreateTaskInput`, se
 * a criação os enviar).
 */
export function TaskEditView({ task: loaded, initialName, onReload, onLeave }: TaskEditViewProps) {
  const { task, draft, setField } = useTaskDraft(loaded ?? null, initialName);
  // A recorrência é outra chamada, com a revisão da série: o rascunho dela fica fora do `TaskDraft`.
  const recurrence = useRecurrenceDraft(task?.recurrence?.id ?? null);
  const [recurrenceErrors, setRecurrenceErrors] = useState<RecurrenceErrors>({});
  const [errors, setErrors] = useState<TaskDraftErrors>({});
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  // A criação usa a mesma chave enquanto o formulário estiver aberto: tocar em Salvar de novo não cria outro evento.
  const [idempotencyKey] = useState(newIdempotencyKey);
  // A guarda vale antes da próxima renderização: dois toques seguidos não mandam duas requisições.
  const busy = useRef(false);

  async function save() {
    if (busy.current) return;
    const problems = validateTaskDraft(draft);
    // Sem série (a criação, ou um evento avulso que vai virar recorrente) Salvar cria a série; o evento avulso fica
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
        // A série vai primeiro: se a API recusar a regra, o evento fica como estava. A mesma chave a cada toque em
        // Salvar: se a série saiu e o evento não, a nova tentativa não cria uma segunda.
        if (newSeries) await createRecurrence(newSeries, { idempotencyKey });
        if (seriesPatch && recurrence.series) await editRecurrence(recurrence.series.id, seriesPatch);
        if (patch) await updateEvent(task.id, patch);
      } else if (newSeries) {
        await createRecurrence(newSeries, { idempotencyKey });
      } else {
        // Sem local digitado, o evento nasce com o endereço de onde a pessoa está.
        const coordinates = draft.location.trim() ? undefined : await currentCoordinates();
        await createEvent(
          { ...buildCreateTaskInput(draft, new Date()), ...(coordinates ? { coordinates } : {}) },
          { idempotencyKey },
        );
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
      leadLabel="Resumo do evento"
      bodyLabel="Conteúdo do evento"
      lead={
        <>
          <EditBar>{task ? "Editar evento" : "Novo evento"}</EditBar>
          <TaskEditHeaderFields draft={draft} errors={errors} onChange={setField} />
        </>
      }
    >
      <form
        className={edit.form}
        aria-label="Campos do evento"
        noValidate
        onSubmit={(submit) => {
          submit.preventDefault();
          void save();
        }}
      >
        <TaskEditInfoSection draft={draft} errors={errors} onChange={setField}>
          {/* A tarefa persistente só existe na edição: a criação ainda não a envia. */}
          {task ? <TaskEditPersistentSection draft={draft} onChange={setField} /> : null}
          {/* A recorrência não aparece com a tarefa persistente: o evento longo não se repete. */}
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
        <EditTagSection tags={draft.tags} labelId="event-edit-tags" listLabel="Tags do evento" onChange={(tags) => setField("tags", tags)} />
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
        {/* A seção de sequência só existe na edição: a criação ainda não a mostra. */}
        {task ? <TaskEditSequenceSection taskId={task.id} draft={draft} onChange={setField} /> : null}
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
