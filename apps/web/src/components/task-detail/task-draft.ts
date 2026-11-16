import type { CreateTaskInput, TaskDto, TaskPriority, HumanTaskKind, HumanTaskStatus } from "@repo/contracts";
import { dayKeyOf, formatTime, zonedDayStart, zonedTimeAt } from "@repo/timeline";
import type { EditEventInput } from "@/lib/api/events";
import { statusPatch } from "@/lib/tasks/task-read-model";
import { type DraftArtifact, artifactLinkInputs, draftArtifactsFromTask, sameArtifactLinks } from "./task-artifact-draft";
import { sameList, sortReminders } from "./task-reminders-tags";

/**
 * O formulário de edição do evento de pessoa, como texto. O estado da tela
 * inteira mora num `TaskDraft`: cada seção lê e escreve os seus campos aqui.
 * Um ticket que acrescenta uma seção acrescenta os campos neste tipo, em
 * `FIELD_SET` (que obriga a listar cada um), na conferência de
 * `validateTaskDraft` se houver, e num ramo de `buildTaskPatch`. O resto
 * não muda.
 */
export interface TaskDraft {
  kind: HumanTaskKind;
  name: string;
  /** `null` é "sem status": o evento volta a ser de referência. */
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
  /** Minutos antes do evento, em ordem crescente (`notifyOffsetsMinutes`). */
  reminders: number[];
  /** Tags já normalizadas (minúsculas, sem espaços nas pontas). */
  tags: string[];
  /** A tarefa persistente: o evento longo, que não é um bloco de tempo e tem a previsão de entrega como prazo. */
  longRunning: boolean;
  /** A sequência, lado "Segue-se de": os eventos que vêm antes deste (ids, na ordem da API). */
  previousTaskIds: string[];
  /** A sequência, lado "Da sequência a": os eventos que se seguem a este (ids). */
  nextTaskIds: string[];
  /**
   * Os artefatos ligados, na ordem da lista: é a ordem enviada. O que o evento criou (`creates`) segue na lista sem
   * posição. Guarda nome e tipo para a lista mostrar sem outra chamada.
   */
  artifacts: DraftArtifact[];
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
  previousTaskIds: true,
  nextTaskIds: true,
  artifacts: true,
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
    location: task.location,
    reminders: sortReminders(task.notifyOffsetsMinutes),
    tags: [...task.tags],
    longRunning: task.longRunning,
    previousTaskIds: [...task.previousTaskIds],
    nextTaskIds: [...task.nextTaskIds],
    artifacts: draftArtifactsFromTask(task.artifacts),
  };
}

/** O rascunho da criação: tudo vazio e sem status, o evento de referência. `name` vem de `/evento comprar pão`. */
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
    previousTaskIds: [],
    nextTaskIds: [],
    artifacts: [],
  };
}

/**
 * O corpo da criação: só o que a pessoa preencheu. Sem data, a API põe agora e
 * estima o fim; sem status, o evento nasce de referência. Criar já concluído
 * manda `finishedAt`, como a troca de status na edição.
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
 * O `PATCH` com só os campos que mudaram em relação ao evento lido, com a
 * revisão lida. `null` quando nada mudou: não há o que enviar. Concluir e
 * reabrir seguem a regra de `statusPatch` (`finishedAt`).
 */
export function buildTaskPatch(task: TaskDto, draft: TaskDraft, now: Date): EditEventInput | null {
  const base = draftFromTask(task);
  const patch: EditEventInput = { expectedRevision: task.revision };
  if (draft.kind !== base.kind) patch.kind = draft.kind;
  if (draft.name.trim() !== base.name.trim()) patch.name = draft.name.trim();
  if (draft.description !== base.description) patch.description = draft.description;
  if (draft.location.trim() !== base.location.trim()) patch.location = draft.location.trim();
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
  if (!sameList(draft.previousTaskIds, base.previousTaskIds)) patch.previousTaskIds = draft.previousTaskIds;
  if (!sameList(draft.nextTaskIds, base.nextTaskIds)) patch.nextTaskIds = draft.nextTaskIds;
  if (!sameArtifactLinks(draft.artifacts, base.artifacts)) patch.artifacts = artifactLinkInputs(draft.artifacts);
  return Object.keys(patch).length > 1 ? patch : null;
}

/**
 * As recusas da própria tela, antes de enviar. A API continua valendo: o que ela recusar volta como mensagem.
 * No evento longo (tarefa persistente) o prazo não se compara com o início, o status é obrigatório e não pode
 * ser "não realizado", e sem prazo não há lembrete. Fora dele, o bloco não dura mais de 31 dias.
 */
export function validateTaskDraft(draft: TaskDraft): TaskDraftErrors {
  const errors: TaskDraftErrors = {};
  if (!draft.name.trim()) errors.name = "Dê um título ao evento.";
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
 * Quando o evento muda em outro lugar, o campo que a pessoa não tocou passa a
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
 * Listas se comparam pelo conteúdo, e na mesma ordem: `draftFromTask` cria arrays e objetos novos a cada leitura, e
 * a lista de artefatos traz objetos (nome e tipo), que só o JSON compara por valor.
 */
function sameDraftValue(a: TaskDraft[TaskDraftField], b: TaskDraft[TaskDraftField]): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return JSON.stringify(a) === JSON.stringify(b);
  return a === b;
}
