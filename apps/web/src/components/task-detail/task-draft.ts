import type { CreateTaskInput, ProjectDto, TaskDto, TaskPriority, HumanTaskKind, HumanTaskStatus } from "@repo/contracts";
import { dayKeyOf, formatTime, zonedDayStart, zonedTimeAt } from "@repo/timeline";
import type { EditTaskInput } from "@/lib/api/tasks";
import { statusPatch } from "@/lib/tasks/task-read-model";
import { type DraftArtifact, artifactLinkInputs, draftArtifactsFromTask, sameArtifactLinks } from "./task-artifact-draft";
import { sameList, sortReminders } from "./task-reminders-tags";

/**
 * O formulário de edição da tarefa de pessoa, como texto. O estado da tela
 * inteira mora num `TaskDraft`: cada seção lê e escreve os seus campos aqui.
 * Um ticket que acrescenta uma seção acrescenta os campos neste tipo, em
 * `FIELD_SET` (que obriga a listar cada um), na conferência de
 * `validateTaskDraft` se houver, e num ramo de `buildTaskPatch`. O resto
 * não muda.
 */
export interface TaskDraft {
  kind: HumanTaskKind;
  name: string;
  /** `null` é "sem status": a tarefa volta a ser de referência. */
  status: HumanTaskStatus | null;
  priority: TaskPriority;
  /** `YYYY-MM-DD` no fuso da timeline, ou vazio: sem data. */
  startDate: string;
  /** `HH:MM`, ou vazio: o dia sem hora começa à meia-noite local. */
  startTime: string;
  endDate: string;
  endTime: string;
  description: string;
  /** Onde acontece; vazio é sem local. */
  location: string;
  /** Minutos antes da tarefa, em ordem crescente (`notifyOffsetsMinutes`). */
  reminders: number[];
  /** Tags já normalizadas (minúsculas, sem espaços nas pontas). */
  tags: string[];
  /** A tarefa persistente: a tarefa longa, que não é um bloco de tempo e tem a previsão de entrega como prazo. */
  longRunning: boolean;
  /** A tarefa principal desta (id), ou `null`: a tarefa não é subtarefa de nenhuma. */
  parentTaskId: string | null;
  /** As subtarefas desta (ids, na ordem da API). */
  subtaskIds: string[];
  /**
   * Os artefatos ligados, na ordem da lista: é a ordem enviada. O que a tarefa criou (`creates`) segue na lista sem
   * posição. Guarda nome e tipo para a lista mostrar sem outra chamada.
   */
  artifacts: DraftArtifact[];
  /**
   * O projeto da tarefa, com a marca e o nome que o campo mostra. `null` na criação, enquanto ninguém escolheu: a
   * tarefa nasce em `personal`, e o campo mostra esse.
   */
  project: ProjectDto | null;
}

export type TaskDraftField = keyof TaskDraft;

/** O limite de um bloco de tempo, em milissegundos (`tasks_block` no TDD: 31 dias). */
const MAX_BLOCK_MS = 31 * 24 * 60 * 60 * 1000;
const LONG_BLOCK_MESSAGE = "Um bloco não dura mais de 31 dias. Para algo que segue por mais tempo, marque como tarefa persistente.";
const LONG_STATUS_MESSAGE = "Tarefa persistente precisa de um status: não pode ficar sem status nem como não realizado.";
const LONG_NO_DEADLINE_REMINDER = "Tarefa persistente sem previsão de entrega não tem lembrete.";

/** Um `true` para cada campo: se o tipo ganhar um campo, este objeto não compila até ele ser listado. */
const FIELD_SET: Record<TaskDraftField, true> = {
  kind: true,
  name: true,
  status: true,
  priority: true,
  startDate: true,
  startTime: true,
  endDate: true,
  endTime: true,
  description: true,
  location: true,
  reminders: true,
  tags: true,
  longRunning: true,
  parentTaskId: true,
  subtaskIds: true,
  artifacts: true,
  project: true,
};
export const TASK_DRAFT_FIELDS = Object.keys(FIELD_SET) as TaskDraftField[];

export type TaskDraftErrors = Partial<Record<TaskDraftField, string>>;

export function draftFromTask(task: TaskDto): TaskDraft {
  const start = splitInstant(task.startedAt);
  const end = splitInstant(task.estimatedFinishAt);
  return {
    kind: task.kind as HumanTaskKind,
    name: task.name,
    status: (task.status ?? null) as HumanTaskStatus | null,
    priority: task.priority,
    startDate: start.date,
    startTime: start.time,
    endDate: end.date,
    endTime: end.time,
    description: task.description,
    location: task.location ?? "",
    reminders: sortReminders(task.notifyOffsetsMinutes),
    tags: [...task.tags],
    longRunning: task.longRunning,
    parentTaskId: task.parentTaskId ?? null,
    subtaskIds: [...task.subtaskIds],
    artifacts: draftArtifactsFromTask(task.artifacts),
    project: { ...task.project },
  };
}

/** O rascunho da criação: tudo vazio e sem status, a tarefa de referência. `name` vem de `/tarefa comprar pão`. */
export function emptyTaskDraft(name = ""): TaskDraft {
  return {
    kind: "common",
    name,
    status: null,
    priority: "medium",
    startDate: "",
    startTime: "",
    endDate: "",
    endTime: "",
    description: "",
    location: "",
    reminders: [],
    tags: [],
    longRunning: false,
    parentTaskId: null,
    subtaskIds: [],
    artifacts: [],
    project: null,
  };
}

/**
 * O corpo da criação: só o que a pessoa preencheu. Sem data, a API põe agora e
 * estima o fim; sem status, a tarefa nasce de referência. Criar já concluído
 * manda `finishedAt`, como a troca de status na edição. Lembretes e tags entram
 * só quando a pessoa escolheu algum.
 */
export function buildCreateTaskInput(draft: TaskDraft, now: Date): CreateTaskInput {
  const input: CreateTaskInput = {
    kind: draft.kind,
    name: draft.name.trim(),
    description: draft.description,
    priority: draft.priority,
  };
  if (draft.status !== null) {
    input.status = draft.status;
    if (draft.status === "done") input.finishedAt = now.toISOString();
  }
  const startedAt = instantFromDraft(draft.startDate, draft.startTime);
  if (startedAt) input.startedAt = startedAt;
  const estimatedFinishAt = instantFromDraft(draft.endDate, draft.endTime);
  if (estimatedFinishAt) input.estimatedFinishAt = estimatedFinishAt;
  if (draft.location.trim()) input.location = draft.location.trim();
  if (draft.reminders.length) input.notifyOffsetsMinutes = draft.reminders;
  if (draft.tags.length) input.tags = draft.tags;
  // Sem escolha, ou com o `personal` (o padrão), a API põe a tarefa em `personal`.
  if (draft.project && !draft.project.personal) input.projectId = draft.project.id;
  return input;
}

function splitInstant(instant: string | undefined): { date: string; time: string } {
  if (!instant) return { date: "", time: "" };
  const date = dayKeyOf(instant);
  const isDayStart = zonedDayStart(date).getTime() === new Date(instant).getTime();
  return { date, time: isDayStart ? "" : formatTime(instant) };
}

/** O instante que a data e a hora marcam; `null` sem data. Dia sem hora é a meia-noite local. */
export function instantFromDraft(date: string, time: string): string | null {
  if (!date) return null;
  return (time ? zonedTimeAt(date, time) : zonedDayStart(date)).toISOString();
}

/**
 * O `PATCH` com só os campos que mudaram em relação à tarefa lida, com a
 * revisão lida. `null` quando nada mudou: não há o que enviar. Concluir e
 * reabrir seguem a regra de `statusPatch` (`finishedAt`).
 */
export function buildTaskPatch(task: TaskDto, draft: TaskDraft, now: Date): EditTaskInput | null {
  const base = draftFromTask(task);
  const patch: EditTaskInput = { expectedRevision: task.revision };
  if (draft.kind !== base.kind) patch.kind = draft.kind;
  if (draft.name.trim() !== base.name.trim()) patch.name = draft.name.trim();
  if (draft.description !== base.description) patch.description = draft.description;
  // Apagar o local manda `null`: a tarefa volta a nao ter local.
  if (draft.location.trim() !== base.location.trim()) patch.location = draft.location.trim() || null;
  if (draft.priority !== base.priority) patch.priority = draft.priority;
  if (draft.status !== base.status) Object.assign(patch, statusPatch(task, draft.status, now));
  if (draft.startDate !== base.startDate || draft.startTime !== base.startTime) {
    patch.startedAt = instantFromDraft(draft.startDate, draft.startTime);
  }
  if (draft.endDate !== base.endDate || draft.endTime !== base.endTime) {
    patch.estimatedFinishAt = instantFromDraft(draft.endDate, draft.endTime);
  }
  if (!sameList(draft.reminders, base.reminders)) patch.notifyOffsetsMinutes = draft.reminders;
  if (!sameList(draft.tags, base.tags)) patch.tags = draft.tags;
  if (draft.longRunning !== base.longRunning) patch.longRunning = draft.longRunning;
  if (draft.parentTaskId !== base.parentTaskId) patch.parentTaskId = draft.parentTaskId;
  if (!sameList(draft.subtaskIds, base.subtaskIds)) patch.subtaskIds = draft.subtaskIds;
  if (!sameArtifactLinks(draft.artifacts, base.artifacts)) patch.artifacts = artifactLinkInputs(draft.artifacts);
  // Voltar ao `personal` manda `null`; outro projeto manda o id.
  if (draft.project && draft.project.id !== base.project?.id) patch.projectId = draft.project.personal ? null : draft.project.id;
  return Object.keys(patch).length > 1 ? patch : null;
}

/**
 * As recusas da própria tela, antes de enviar. A API continua valendo: o que ela recusar volta como mensagem.
 * Na tarefa longa (tarefa persistente) o prazo não se compara com o início, o status é obrigatório e não pode
 * ser "não realizado", e sem prazo não há lembrete. Fora dele, o bloco não dura mais de 31 dias.
 */
export function validateTaskDraft(draft: TaskDraft): TaskDraftErrors {
  const errors: TaskDraftErrors = {};
  if (!draft.name.trim()) errors.name = "Dê um título à tarefa.";
  if (draft.location.length > 300) errors.location = "O local tem no máximo 300 caracteres.";
  if (draft.startTime && !draft.startDate) errors.startTime = "Informe a data para marcar a hora.";
  if (draft.endTime && !draft.endDate) errors.endTime = "Informe a data para marcar a hora.";
  const start = instantFromDraft(draft.startDate, draft.startTime);
  const end = instantFromDraft(draft.endDate, draft.endTime);
  if (draft.longRunning) {
    if (draft.status === null || draft.status === "missed") errors.status = LONG_STATUS_MESSAGE;
    if (!end && draft.reminders.length > 0) errors.reminders = LONG_NO_DEADLINE_REMINDER;
  } else if (start && end) {
    if (Date.parse(end) < Date.parse(start)) errors.endDate = "O término não pode ser antes do início.";
    else if (Date.parse(end) - Date.parse(start) > MAX_BLOCK_MS) errors.endDate = LONG_BLOCK_MESSAGE;
  }
  return errors;
}

/**
 * Quando a tarefa muda em outro lugar, o campo que a pessoa não tocou passa a
 * valer o da versão nova, e o que ela digitou fica para ela conferir.
 */
export function rebaseDraft(draft: TaskDraft, previous: TaskDto, next: TaskDto): TaskDraft {
  const before = draftFromTask(previous);
  const after = draftFromTask(next);
  const rebased: TaskDraft = { ...draft };
  for (const field of TASK_DRAFT_FIELDS) {
    if (sameDraftValue(draft[field], before[field])) Object.assign(rebased, { [field]: after[field] });
  }
  return rebased;
}

/**
 * Listas e objetos se comparam pelo conteúdo, e na mesma ordem: `draftFromTask` cria arrays e objetos novos a cada
 * leitura, e a lista de artefatos traz objetos (nome e tipo), assim como o projeto, que só o JSON compara por valor.
 */
function sameDraftValue(a: TaskDraft[TaskDraftField], b: TaskDraft[TaskDraftField]): boolean {
  if (typeof a === "object" && typeof b === "object" && a !== null && b !== null) return JSON.stringify(a) === JSON.stringify(b);
  return a === b;
}
