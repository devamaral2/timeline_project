import type { CreateEventInput, EventDto, EventPriority, HumanEventKind, HumanEventStatus } from "@repo/contracts";
import { dayKeyOf, formatTime, zonedDayStart, zonedTimeAt } from "@repo/timeline";
import type { EditEventInput } from "@/lib/api/events";
import { statusPatch } from "@/lib/events/event-read-model";
import { type DraftArtifact, artifactLinkInputs, draftArtifactsFromEvent, sameArtifactLinks } from "./event-artifact-draft";
import { sameList, sortReminders } from "./event-reminders-tags";

/**
 * O formulário de edição do evento de pessoa, como texto. O estado da tela
 * inteira mora num `EventDraft`: cada seção lê e escreve os seus campos aqui.
 * Um ticket que acrescenta uma seção acrescenta os campos neste tipo, em
 * `FIELD_SET` (que obriga a listar cada um), na conferência de
 * `validateEventDraft` se houver, e num ramo de `buildEventPatch`. O resto
 * não muda.
 */
export interface EventDraft {
  kind: HumanEventKind;
  name: string;
  /** `null` é "sem status": o evento volta a ser de referência. */
  status: HumanEventStatus | null;
  priority: EventPriority;
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
  previousEventIds: string[];
  /** A sequência, lado "Da sequência a": os eventos que se seguem a este (ids). */
  nextEventIds: string[];
  /**
   * Os artefatos ligados, na ordem da lista: é a ordem enviada. O que o evento criou (`creates`) segue na lista sem
   * posição. Guarda nome e tipo para a lista mostrar sem outra chamada.
   */
  artifacts: DraftArtifact[];
}

export type EventDraftField = keyof EventDraft;

/** O limite de um bloco de tempo, em milissegundos (`events_block` no TDD: 31 dias). */
const MAX_BLOCK_MS = 31 * 24 * 60 * 60 * 1000;
const LONG_BLOCK_MESSAGE = "Um bloco não dura mais de 31 dias. Para algo que segue por mais tempo, marque como tarefa persistente.";
const LONG_STATUS_MESSAGE = "Tarefa persistente precisa de um status: não pode ficar sem status nem como não realizado.";
const LONG_NO_DEADLINE_REMINDER = "Tarefa persistente sem previsão de entrega não tem lembrete.";

/** Um `true` para cada campo: se o tipo ganhar um campo, este objeto não compila até ele ser listado. */
const FIELD_SET: Record<EventDraftField, true> = {
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
  previousEventIds: true,
  nextEventIds: true,
  artifacts: true,
};
export const EVENT_DRAFT_FIELDS = Object.keys(FIELD_SET) as EventDraftField[];

export type EventDraftErrors = Partial<Record<EventDraftField, string>>;

export function draftFromEvent(event: EventDto): EventDraft {
  const start = splitInstant(event.startedAt);
  const end = splitInstant(event.estimatedFinishAt);
  return {
    kind: event.kind as HumanEventKind,
    name: event.name,
    status: (event.status ?? null) as HumanEventStatus | null,
    priority: event.priority,
    startDate: start.date,
    startTime: start.time,
    endDate: end.date,
    endTime: end.time,
    description: event.description,
    location: event.location,
    reminders: sortReminders(event.notifyOffsetsMinutes),
    tags: [...event.tags],
    longRunning: event.longRunning,
    previousEventIds: [...event.previousEventIds],
    nextEventIds: [...event.nextEventIds],
    artifacts: draftArtifactsFromEvent(event.artifacts),
  };
}

/** O rascunho da criação: tudo vazio e sem status, o evento de referência. `name` vem de `/evento comprar pão`. */
export function emptyEventDraft(name = ""): EventDraft {
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
    previousEventIds: [],
    nextEventIds: [],
    artifacts: [],
  };
}

/**
 * O corpo da criação: só o que a pessoa preencheu. Sem data, a API põe agora e
 * estima o fim; sem status, o evento nasce de referência. Criar já concluído
 * manda `finishedAt`, como a troca de status na edição.
 */
export function buildCreateEventInput(draft: EventDraft, now: Date): CreateEventInput {
  const input: CreateEventInput = {
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
export function buildEventPatch(event: EventDto, draft: EventDraft, now: Date): EditEventInput | null {
  const base = draftFromEvent(event);
  const patch: EditEventInput = { expectedRevision: event.revision };
  if (draft.kind !== base.kind) patch.kind = draft.kind;
  if (draft.name.trim() !== base.name.trim()) patch.name = draft.name.trim();
  if (draft.description !== base.description) patch.description = draft.description;
  if (draft.location.trim() !== base.location.trim()) patch.location = draft.location.trim();
  if (draft.priority !== base.priority) patch.priority = draft.priority;
  if (draft.status !== base.status) Object.assign(patch, statusPatch(event, draft.status, now));
  if (draft.startDate !== base.startDate || draft.startTime !== base.startTime) {
    patch.startedAt = instantFromDraft(draft.startDate, draft.startTime);
  }
  if (draft.endDate !== base.endDate || draft.endTime !== base.endTime) {
    patch.estimatedFinishAt = instantFromDraft(draft.endDate, draft.endTime);
  }
  if (!sameList(draft.reminders, base.reminders)) patch.notifyOffsetsMinutes = draft.reminders;
  if (!sameList(draft.tags, base.tags)) patch.tags = draft.tags;
  if (draft.longRunning !== base.longRunning) patch.longRunning = draft.longRunning;
  if (!sameList(draft.previousEventIds, base.previousEventIds)) patch.previousEventIds = draft.previousEventIds;
  if (!sameList(draft.nextEventIds, base.nextEventIds)) patch.nextEventIds = draft.nextEventIds;
  if (!sameArtifactLinks(draft.artifacts, base.artifacts)) patch.artifacts = artifactLinkInputs(draft.artifacts);
  return Object.keys(patch).length > 1 ? patch : null;
}

/**
 * As recusas da própria tela, antes de enviar. A API continua valendo: o que ela recusar volta como mensagem.
 * No evento longo (tarefa persistente) o prazo não se compara com o início, o status é obrigatório e não pode
 * ser "não realizado", e sem prazo não há lembrete. Fora dele, o bloco não dura mais de 31 dias.
 */
export function validateEventDraft(draft: EventDraft): EventDraftErrors {
  const errors: EventDraftErrors = {};
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
export function rebaseDraft(draft: EventDraft, previous: EventDto, next: EventDto): EventDraft {
  const before = draftFromEvent(previous);
  const after = draftFromEvent(next);
  const rebased: EventDraft = { ...draft };
  for (const field of EVENT_DRAFT_FIELDS) {
    if (sameDraftValue(draft[field], before[field])) Object.assign(rebased, { [field]: after[field] });
  }
  return rebased;
}

/**
 * Listas se comparam pelo conteúdo, e na mesma ordem: `draftFromEvent` cria arrays e objetos novos a cada leitura, e
 * a lista de artefatos traz objetos (nome e tipo), que só o JSON compara por valor.
 */
function sameDraftValue(a: EventDraft[EventDraftField], b: EventDraft[EventDraftField]): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return JSON.stringify(a) === JSON.stringify(b);
  return a === b;
}
