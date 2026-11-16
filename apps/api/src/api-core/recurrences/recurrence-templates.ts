import {
  Event,
  EventNotFoundError,
  EventOwnershipError,
  RecurrenceValidationError,
  type Artifact,
  type EventPriority,
  type HumanEventKind,
  type HumanEventStatus,
  type OccurrenceLink,
  type Recurrence,
  type RecurrenceRule,
} from "../../domain";
import type { RecurrenceTemplate } from "@repo/contracts";
import type { EventRepository } from "../../domain/ports";
import { dayKeyOf, expandOccurrences, occurrenceWindow, shiftDayKey } from "@repo/timeline";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import type { CreateEventUseCase, PrepareEventOptions } from "../events/create-event.usecase";

/** O que cada ocorrencia copia, ja resolvido. E o que a serie guarda em `template`. */
export interface StoredTemplate {
  kind: HumanEventKind;
  /** Ausente, cada ocorrencia nasce de referencia. */
  status?: HumanEventStatus;
  name: string;
  description: string;
  /** Onde cada ocorrencia acontece. */
  location: string;
  tags: string[];
  priority: EventPriority;
  notifyOffsetsMinutes: number[];
  /** Os mesmos artefatos em todas as ocorrencias, na ordem; cada uma ganha a propria relacao com eles. */
  artifactIds: string[];
  /** Os eventos maiores de que cada ocorrencia nasce subtarefa. */
  previousTaskIds: string[];
}

export interface PreparedTemplate {
  template: StoredTemplate;
  /** Os artefatos que o template cria, gravados junto com a serie. */
  artifacts: Artifact[];
  derivations: { originalId: string; copyId: string }[];
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

export function storedTemplateOf(recurrence: Recurrence): StoredTemplate {
  const template = recurrence.template as Partial<StoredTemplate>;
  return {
    kind: template.kind ?? "common",
    status: template.status,
    name: template.name ?? "",
    description: template.description ?? "",
    location: template.location ?? "",
    tags: template.tags ?? [],
    priority: template.priority ?? "medium",
    notifyOffsetsMinutes: template.notifyOffsetsMinutes ?? [],
    artifactIds: template.artifactIds ?? [],
    previousTaskIds: template.previousTaskIds ?? [],
  };
}

/**
 * Resolve o template uma vez, com a janela da primeira ocorrencia: o nome
 * derivado ("Almoco") sai da hora da regra, os artefatos novos viram ids, e se
 * o template nao gera um evento valido a serie nao e salva.
 */
export async function prepareTemplate(
  deps: { createEvent: Pick<CreateEventUseCase, "prepare">; events: Pick<EventRepository, "findByIds"> },
  template: RecurrenceTemplate,
  rule: RecurrenceRule,
  actor: AuthenticatedUser,
  options?: PrepareEventOptions,
): Promise<PreparedTemplate> {
  if (typeof template !== "object" || template === null) {
    throw new RecurrenceValidationError("A recurrence template must be an object");
  }
  // Os antecessores ficam fora do ensaio: seguir-se deles so acontece quando a ocorrencia nasce.
  const { previousTaskIds = [], ...eventInput } = template;
  await assertOwnedEvents(deps.events, previousTaskIds, actor);

  const { event, artifacts, derivations } = await deps.createEvent.prepare(
    eventInput,
    actor,
    occurrenceWindow(rule, sampleDayOf(rule)),
    options,
  );
  return {
    template: {
      kind: event.kind as HumanEventKind,
      ...(event.status ? { status: event.status as HumanEventStatus } : {}),
      name: event.name,
      description: event.description,
      location: event.location,
      tags: [...event.tags],
      priority: event.priority,
      notifyOffsetsMinutes: [...event.notifyOffsetsMinutes],
      artifactIds: event.artifactLinks.map((link) => link.artifactId),
      previousTaskIds: [...new Set(previousTaskIds)],
    },
    artifacts,
    derivations,
  };
}

async function assertOwnedEvents(
  events: Pick<EventRepository, "findByIds">,
  ids: readonly string[],
  actor: AuthenticatedUser,
): Promise<void> {
  if (ids.length === 0) return;
  const found = new Map((await events.findByIds(ids)).map((event) => [event.id, event]));
  for (const id of ids) {
    const event = found.get(id);
    if (!event) throw new EventNotFoundError(`Event not found: ${id}`);
    if (event.userId !== actor.userId) throw new EventOwnershipError();
  }
}

function linkOf(recurrence: Recurrence, dayKey: string): OccurrenceLink {
  return { recurrenceId: recurrence.id, occurrenceOn: dayKey, detached: false };
}

/** `liveArtifactIds`: os artefatos do template que ainda existem; um apagado some das ocorrencias novas. */
export function buildOccurrence(recurrence: Recurrence, dayKey: string, liveArtifactIds?: ReadonlySet<string>): Event {
  const template = storedTemplateOf(recurrence);
  const window = occurrenceWindow(recurrence.rule, dayKey);
  return Event.create({
    userId: recurrence.userId,
    kind: template.kind,
    status: template.status,
    name: template.name,
    description: template.description,
    location: template.location,
    startedAt: window.startedAt,
    estimatedFinishAt: window.estimatedFinishAt,
    tags: template.tags,
    priority: template.priority,
    notifyOffsetsMinutes: template.notifyOffsetsMinutes,
    // O mesmo artefato em todas as ocorrencias, cada uma com a propria relacao.
    artifactLinks: template.artifactIds
      .filter((artifactId) => !liveArtifactIds || liveArtifactIds.has(artifactId))
      .map((artifactId) => ({ artifactId, relation: "uses" as const, fromRecurrence: true })),
    occurrence: linkOf(recurrence, dayKey),
  });
}

/** Hoje, no fuso da regra: o dia a partir do qual "futuro" comeca para ela. */
export function todayOf(rule: RecurrenceRule, now: Date): string {
  return dayKeyOf(now, rule.timeZone);
}
