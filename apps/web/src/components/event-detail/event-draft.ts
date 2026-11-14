import type { CreateEventInput, EventDto, EventPriority, HumanEventKind, HumanEventStatus } from "@repo/contracts";
import { dayKeyOf, formatTime, zonedDayStart, zonedTimeAt } from "@repo/timeline";
import type { EditEventInput } from "@/lib/api/events";
import { statusPatch } from "@/lib/events/event-read-model";
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
  /** Minutos antes do evento, em ordem crescente (`notifyOffsetsMinutes`). */
  reminders: number[];
  /** Tags já normalizadas (minúsculas, sem espaços nas pontas). */
  tags: string[];
}

export type EventDraftField = keyof EventDraft;

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
  reminders: true,
  tags: true,
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
    reminders: sortReminders(event.notifyOffsetsMinutes),
    tags: [...event.tags],
  };
}

/** O rascunho da criação: tudo vazio e sem status, o evento de referência. `name` vem de `/evento comprar pão`. */
export function emptyEventDraft(name = ""): EventDraft {
  return {
    kind: "routine",
    name,
    status: null,
    priority: "medium",
    startDate: "",
    startTime: "",
    endDate: "",
    endTime: "",
    description: "",
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
  return Object.keys(patch).length > 1 ? patch : null;
}

/** As recusas da própria tela, antes de enviar. A API continua valendo: o que ela recusar volta como mensagem. */
export function validateEventDraft(draft: EventDraft): EventDraftErrors {
  const errors: EventDraftErrors = {};
  if (!draft.name.trim()) errors.name = "Dê um título ao evento.";
  if (draft.startTime && !draft.startDate) errors.startTime = "Informe a data para marcar a hora.";
  if (draft.endTime && !draft.endDate) errors.endTime = "Informe a data para marcar a hora.";
  const start = instantFromDraft(draft.startDate, draft.startTime);
  const end = instantFromDraft(draft.endDate, draft.endTime);
  if (start && end && Date.parse(end) < Date.parse(start)) errors.endDate = "O término não pode ser antes do início.";
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

/** Listas se comparam pelo conteúdo: `draftFromEvent` cria arrays novos a cada leitura. */
function sameDraftValue(a: EventDraft[EventDraftField], b: EventDraft[EventDraftField]): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return sameList<unknown>(a, b);
  return a === b;
}
