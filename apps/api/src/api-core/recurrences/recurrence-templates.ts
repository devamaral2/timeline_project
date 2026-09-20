import {
  Event,
  EventItem,
  RecurrenceValidationError,
  Task,
  type EventPriority,
  type OccurrenceLink,
  type Recurrence,
  type RecurrenceRule,
  type WorkItemPriority,
} from "../../domain";
import type {
  EventRecurrenceTemplate,
  TaskRecurrenceTemplate,
} from "@repo/contracts";
import type { TaskRepository } from "../../domain/ports";
import { dayKeyOf, expandOccurrences, occurrenceWindow, shiftDayKey } from "@repo/timeline";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import type { CreateEventUseCase } from "../events/create-event.usecase";
import { assertParentTaskAssignable } from "../tasks/assert-parent-task";

/** O que cada ocorrencia de evento copia, ja resolvido. */
export interface StoredEventTemplate {
  name: string;
  description: string;
  tags: string[];
  priority: EventPriority;
  items: { type: string; position: number; isPrimary: boolean; schemaVersion: number; data: unknown }[];
}

export interface StoredTaskTemplate {
  name: string;
  description: string;
  tags: string[];
  priority?: WorkItemPriority;
  parentTaskId?: string;
}

/** Ate onde uma serie nova olha para achar um dia de ensaio. */
const SAMPLE_SEARCH_DAYS = 366 * 4;

/**
 * O primeiro dia em que a regra cai, para montar uma ocorrencia de ensaio.
 * Uma regra que nao cai em dia nenhum (dia 31 de uma serie que termina em
 * abril, por exemplo) nao gera nada, e e melhor recusar do que salvar um
 * fantasma.
 */
export function sampleDayOf(rule: RecurrenceRule): string {
  const [first] = expandOccurrences(rule, rule.startsOn, shiftDayKey(rule.startsOn, SAMPLE_SEARCH_DAYS));
  if (!first) throw new RecurrenceValidationError("The recurrence never happens");
  return first;
}

/**
 * Resolve o template de evento uma vez, com a janela da primeira ocorrencia:
 * a refeicao passa pelo modelo aqui, o nome derivado ("Almoco") sai da hora da
 * regra, e se o template nao gera um evento valido a serie nao e salva.
 */
export async function prepareEventTemplate(
  createEvent: CreateEventUseCase,
  template: EventRecurrenceTemplate,
  rule: RecurrenceRule,
  actor: AuthenticatedUser,
): Promise<StoredEventTemplate> {
  if (!Array.isArray(template?.items)) {
    throw new RecurrenceValidationError("An event template needs items");
  }
  const sample = await createEvent.prepare(template, actor, occurrenceWindow(rule, sampleDayOf(rule)));
  return {
    name: sample.name,
    description: sample.description,
    tags: [...sample.tags],
    priority: sample.priority,
    items: sample.items.map((item) => ({
      type: item.type,
      position: item.position,
      isPrimary: item.isPrimary,
      schemaVersion: item.schemaVersion,
      data: item.data,
    })),
  };
}

export async function prepareTaskTemplate(
  tasks: TaskRepository,
  template: TaskRecurrenceTemplate,
  rule: RecurrenceRule,
  actor: AuthenticatedUser,
): Promise<StoredTaskTemplate> {
  if (template.parentTaskId !== undefined) {
    await assertParentTaskAssignable(tasks, template.parentTaskId, actor.userId);
  }
  const stored: StoredTaskTemplate = {
    name: template.name ?? "",
    description: template.description ?? "",
    tags: template.tags ?? [],
    priority: template.priority,
    parentTaskId: template.parentTaskId,
  };
  // Ensaio: a entidade recusa aqui o que recusaria em toda materializacao.
  buildTaskOccurrence(stored, rule, actor.userId, { recurrenceId: "sample", occurrenceOn: sampleDayOf(rule), detached: false });
  return stored;
}

function linkOf(recurrence: Recurrence, dayKey: string): OccurrenceLink {
  return { recurrenceId: recurrence.id, occurrenceOn: dayKey, detached: false };
}

export function buildEventOccurrence(recurrence: Recurrence, dayKey: string): Event {
  const template = recurrence.template as unknown as StoredEventTemplate;
  const window = occurrenceWindow(recurrence.rule, dayKey);
  return Event.create({
    userId: recurrence.userId,
    name: template.name,
    description: template.description,
    startedAt: window.startedAt,
    finishedAt: window.finishedAt,
    tags: template.tags,
    interruptions: [],
    // Ids novos por ocorrencia: cada evento e dono dos proprios itens.
    items: template.items.map((item) => EventItem.create({ ...item })),
    priority: template.priority,
    occurrence: linkOf(recurrence, dayKey),
  });
}

function buildTaskOccurrence(
  template: StoredTaskTemplate,
  rule: RecurrenceRule,
  userId: string,
  occurrence: OccurrenceLink,
): Task {
  const window = occurrenceWindow(rule, occurrence.occurrenceOn);
  return Task.create({
    userId,
    parentTaskId: template.parentTaskId,
    name: template.name,
    description: template.description,
    tags: template.tags,
    priority: template.priority,
    // Os mesmos dois campos que o evento usa: inicio da ocorrencia e, com
    // duracao, o prazo.
    startedAt: window.startedAt,
    estimatedFinishAt: window.finishedAt,
    occurrence,
  });
}

export function buildTaskOccurrenceOf(recurrence: Recurrence, dayKey: string): Task {
  return buildTaskOccurrence(
    recurrence.template as unknown as StoredTaskTemplate,
    recurrence.rule,
    recurrence.userId,
    linkOf(recurrence, dayKey),
  );
}

/** Hoje, no fuso da regra — o dia a partir do qual "futuro" comeca para ela. */
export function todayOf(rule: RecurrenceRule, now: Date): string {
  return dayKeyOf(now, rule.timeZone);
}
