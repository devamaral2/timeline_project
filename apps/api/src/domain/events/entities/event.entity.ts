import {
  AGENT_KINDS,
  AGENT_STATUSES,
  HUMAN_KINDS,
  HUMAN_STATUSES,
  PRIORITIES,
  type Actor,
  type EventKind,
  type EventPriority,
  type EventStatus,
} from "../../sets";
import { defaultEventDurationMinutesFor } from "../types/default-event-duration";
import {
  DEFAULT_EVENT_NOTIFICATION_OFFSETS_MINUTES,
  isNotificationOffsetMinutes,
  type NotificationOffsetMinutes,
} from "../types/notification-offset-minutes";
import { normalizeArtifactLinks, type ArtifactLink } from "../types/artifact-link";
import { TagList } from "../value-objects/tag-list";
import { EventId } from "../value-objects/event-id";
import { EventValidationError } from "../errors/event.errors";
import { detachOccurrence, type OccurrenceLink } from "../../recurrences/types/occurrence-link";

export const DEFAULT_EVENT_KIND: EventKind = "routine";
export const DEFAULT_EVENT_PRIORITY: EventPriority = "medium";

/** O bloco de um evento na agenda dura no maximo isto; acima disso, e um evento longo. */
export const MAX_EVENT_BLOCK_DAYS = 31;
const MAX_EVENT_BLOCK_MS = MAX_EVENT_BLOCK_DAYS * 24 * 60 * 60 * 1000;

export interface EventCreateProps {
  id?: string;
  userId: string;
  /** Quem executa. Ausente e uma pessoa. */
  actor?: Actor;
  kind?: EventKind;
  /** Ausente num evento de pessoa, ele e de referencia: so marca um horario. */
  status?: EventStatus;
  priority?: EventPriority;
  name: string;
  description?: string;
  /** Inicio planejado. */
  startedAt?: Date;
  /** Fim planejado: o fim do bloco ou, no evento longo, o prazo. */
  estimatedFinishAt?: Date;
  /** Conclusao real. */
  finishedAt?: Date;
  notifyOffsetsMinutes?: NotificationOffsetMinutes[];
  tags?: string[];
  longRunning?: boolean;
  /** Pequeno: resumo, agente interno do passo, contexto de tela. */
  data?: Record<string, unknown>;
  /** Os artefatos do evento, na ordem em que aparecem. */
  artifactLinks?: ArtifactLink[];
  /** Os eventos em que este se desdobra. */
  subtaskIds?: string[];
  /** Os eventos que so sao liberados quando este termina. */
  blocksIds?: string[];
  occurrence?: OccurrenceLink;
}

export interface EventRehydrateProps extends EventCreateProps {
  actor: Actor;
  kind: EventKind;
  revision: number;
  /** Os eventos maiores de que este e subtarefa. A relacao pertence a eles: aqui e so leitura. */
  parentIds?: string[];
  /** Os eventos que precisam terminar antes deste. A relacao pertence a eles: aqui e so leitura. */
  blockedByIds?: string[];
}

/** `null` apaga o campo. Sem status, o evento volta a ser de referencia. */
export interface EventReviseChanges {
  kind?: EventKind;
  status?: EventStatus | null;
  priority?: EventPriority;
  name?: string;
  description?: string;
  startedAt?: Date | null;
  estimatedFinishAt?: Date | null;
  finishedAt?: Date | null;
  notifyOffsetsMinutes?: NotificationOffsetMinutes[];
  tags?: string[];
  longRunning?: boolean;
  artifactLinks?: ArtifactLink[];
  subtaskIds?: string[];
  blocksIds?: string[];
}

interface EventBuildProps {
  id: string;
  userId: string;
  actor: Actor;
  kind: EventKind;
  status: EventStatus | undefined;
  priority: EventPriority;
  name: string;
  description: string;
  startedAt: Date | undefined;
  estimatedFinishAt: Date | undefined;
  finishedAt: Date | undefined;
  notifyOffsetsMinutes: NotificationOffsetMinutes[];
  tags: string[];
  longRunning: boolean;
  data: Record<string, unknown>;
  artifactLinks: ArtifactLink[];
  subtaskIds: string[];
  blocksIds: string[];
  parentIds: string[];
  blockedByIds: string[];
  occurrence: OccurrenceLink | undefined;
  revision: number;
}

function includes<T extends string>(values: readonly T[], value: unknown): value is T {
  return values.includes(value as T);
}

function unique(ids: readonly string[]): string[] {
  return Array.from(new Set(ids));
}

/**
 * Algo que uma pessoa ou um agente faz ou vai fazer. E a unica entidade de
 * acao: com status, o evento e acompanhado (o que antes era uma tarefa); sem
 * status, so marca um horario na agenda.
 *
 * As relacoes pertencem ao evento de origem. Este agregado guarda as que saem
 * dele (artefatos, subtarefas e bloqueios) e so le as que chegam (`parentIds`,
 * `blockedByIds`).
 */
export class Event {
  readonly id: string;
  readonly userId: string;
  readonly actor: Actor;
  readonly kind: EventKind;
  readonly status: EventStatus | undefined;
  readonly priority: EventPriority;
  readonly name: string;
  readonly description: string;
  readonly startedAt: Date | undefined;
  readonly estimatedFinishAt: Date | undefined;
  readonly finishedAt: Date | undefined;
  readonly notifyOffsetsMinutes: readonly NotificationOffsetMinutes[];
  readonly tags: string[];
  readonly longRunning: boolean;
  readonly data: Readonly<Record<string, unknown>>;
  readonly artifactLinks: readonly ArtifactLink[];
  readonly subtaskIds: readonly string[];
  readonly blocksIds: readonly string[];
  readonly parentIds: readonly string[];
  readonly blockedByIds: readonly string[];
  /** Presente quando o evento e uma ocorrencia de uma serie. */
  readonly occurrence: OccurrenceLink | undefined;
  readonly revision: number;

  private constructor(props: EventBuildProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.actor = props.actor;
    this.kind = props.kind;
    this.status = props.status;
    this.priority = props.priority;
    this.name = props.name;
    this.description = props.description;
    this.startedAt = props.startedAt;
    this.estimatedFinishAt = props.estimatedFinishAt;
    this.finishedAt = props.finishedAt;
    this.notifyOffsetsMinutes = props.notifyOffsetsMinutes;
    this.tags = props.tags;
    this.longRunning = props.longRunning;
    this.data = props.data;
    this.artifactLinks = props.artifactLinks;
    this.subtaskIds = props.subtaskIds;
    this.blocksIds = props.blocksIds;
    this.parentIds = props.parentIds;
    this.blockedByIds = props.blockedByIds;
    this.occurrence = props.occurrence;
    this.revision = props.revision;
  }

  /** Evento de referencia: sem status, so marca um horario. So existe para pessoa. */
  get isReference(): boolean {
    return this.status === undefined;
  }

  private static build(props: EventBuildProps): Event {
    if (!Number.isInteger(props.revision) || props.revision < 1) {
      throw new EventValidationError("Event revision must be an integer >= 1");
    }
    if (!includes(PRIORITIES, props.priority)) {
      throw new EventValidationError(`Invalid event priority: ${props.priority}`);
    }
    if (props.actor === "human") {
      if (!includes(HUMAN_KINDS, props.kind)) {
        throw new EventValidationError(`Invalid kind for a human event: ${props.kind}`);
      }
      if (props.status !== undefined && !includes(HUMAN_STATUSES, props.status)) {
        throw new EventValidationError(`Invalid status for a human event: ${props.status}`);
      }
    } else {
      if (!includes(AGENT_KINDS, props.kind)) {
        throw new EventValidationError(`Invalid kind for an agent event: ${props.kind}`);
      }
      if (!includes(AGENT_STATUSES, props.status)) {
        throw new EventValidationError("An agent event always has one of the agent statuses");
      }
    }

    if (props.longRunning) {
      if (props.actor !== "human") throw new EventValidationError("Only a human event can be long-running");
      if (props.status === undefined) throw new EventValidationError("A long-running event always has a status");
      if (props.status === "missed") throw new EventValidationError("A long-running event is never missed");
      if (props.occurrence) throw new EventValidationError("A long-running event does not repeat");
      if (!props.estimatedFinishAt && props.notifyOffsetsMinutes.length > 0) {
        throw new EventValidationError("A long-running event without a deadline has no notifications");
      }
    } else {
      if (props.status === undefined && !props.startedAt) {
        throw new EventValidationError("A reference event requires startedAt");
      }
      if (props.startedAt && props.estimatedFinishAt) {
        const span = props.estimatedFinishAt.getTime() - props.startedAt.getTime();
        if (span < 0) throw new EventValidationError("estimatedFinishAt must be equal to or after startedAt");
        if (span > MAX_EVENT_BLOCK_MS) {
          throw new EventValidationError(`An event longer than ${MAX_EVENT_BLOCK_DAYS} days must be long-running`);
        }
      }
    }

    if (!props.notifyOffsetsMinutes.every(isNotificationOffsetMinutes)) {
      throw new EventValidationError("Invalid notification offset");
    }
    if (props.subtaskIds.includes(props.id)) throw new EventValidationError("Event cannot be its own subtask");
    if (props.blocksIds.includes(props.id)) throw new EventValidationError("Event cannot block itself");
    if (typeof props.data !== "object" || props.data === null || Array.isArray(props.data)) {
      throw new EventValidationError("Event data must be an object");
    }

    return new Event({
      ...props,
      tags: TagList.create(props.tags),
      notifyOffsetsMinutes: Array.from(new Set(props.notifyOffsetsMinutes)),
      artifactLinks: normalizeArtifactLinks(props.artifactLinks),
      subtaskIds: unique(props.subtaskIds),
      blocksIds: unique(props.blocksIds),
      parentIds: unique(props.parentIds),
      blockedByIds: unique(props.blockedByIds),
    });
  }

  /**
   * Um evento de referencia novo nunca fica sem fim planejado: sem ele,
   * estimamos pela duracao tipica do `kind`. Um evento longo nasce `todo`.
   */
  static create(props: EventCreateProps): Event {
    const actor = props.actor ?? "human";
    const kind = props.kind ?? DEFAULT_EVENT_KIND;
    const longRunning = props.longRunning ?? false;
    const status = props.status ?? (longRunning ? "todo" : undefined);
    const reference = status === undefined;
    const estimatedFinishAt =
      props.estimatedFinishAt ??
      (reference && props.startedAt
        ? new Date(props.startedAt.getTime() + defaultEventDurationMinutesFor(kind) * 60_000)
        : undefined);

    return Event.build({
      id: props.id ?? EventId.create(),
      userId: props.userId,
      actor,
      kind,
      status,
      priority: props.priority ?? DEFAULT_EVENT_PRIORITY,
      name: props.name,
      description: props.description ?? "",
      startedAt: props.startedAt,
      estimatedFinishAt,
      finishedAt: props.finishedAt,
      notifyOffsetsMinutes: props.notifyOffsetsMinutes ?? (reference ? DEFAULT_EVENT_NOTIFICATION_OFFSETS_MINUTES : []),
      tags: props.tags ?? [],
      longRunning,
      data: props.data ?? {},
      artifactLinks: props.artifactLinks ?? [],
      subtaskIds: props.subtaskIds ?? [],
      blocksIds: props.blocksIds ?? [],
      parentIds: [],
      blockedByIds: [],
      occurrence: props.occurrence,
      revision: 1,
    });
  }

  /** Nao reaplica nenhum default de evento novo: a linha volta como foi gravada. */
  static rehydrate(props: EventRehydrateProps): Event {
    return Event.build({
      id: props.id ?? EventId.create(),
      userId: props.userId,
      actor: props.actor,
      kind: props.kind,
      status: props.status,
      priority: props.priority ?? DEFAULT_EVENT_PRIORITY,
      name: props.name,
      description: props.description ?? "",
      startedAt: props.startedAt,
      estimatedFinishAt: props.estimatedFinishAt,
      finishedAt: props.finishedAt,
      notifyOffsetsMinutes: props.notifyOffsetsMinutes ?? [],
      tags: props.tags ?? [],
      longRunning: props.longRunning ?? false,
      data: props.data ?? {},
      artifactLinks: props.artifactLinks ?? [],
      subtaskIds: props.subtaskIds ?? [],
      blocksIds: props.blocksIds ?? [],
      parentIds: props.parentIds ?? [],
      blockedByIds: props.blockedByIds ?? [],
      occurrence: props.occurrence,
      revision: props.revision,
    });
  }

  /**
   * Toda revisao e uma edicao do usuario, e por isso destaca a ocorrencia da
   * serie. Mexer numa relacao que sai do evento tambem e uma revisao dele. So
   * eventos de pessoa sao revisados: os de agente mudam pelo proprio agente.
   */
  revise(changes: EventReviseChanges): Event {
    if (this.actor !== "human") throw new EventValidationError("An agent event cannot be edited");
    const pick = <T>(change: T | null | undefined, current: T | undefined): T | undefined =>
      change === undefined ? current : (change ?? undefined);

    return Event.build({
      id: this.id,
      userId: this.userId,
      actor: this.actor,
      kind: changes.kind ?? this.kind,
      status: pick(changes.status, this.status),
      priority: changes.priority ?? this.priority,
      name: changes.name ?? this.name,
      description: changes.description ?? this.description,
      startedAt: pick(changes.startedAt, this.startedAt),
      estimatedFinishAt: pick(changes.estimatedFinishAt, this.estimatedFinishAt),
      finishedAt: pick(changes.finishedAt, this.finishedAt),
      notifyOffsetsMinutes: changes.notifyOffsetsMinutes ?? [...this.notifyOffsetsMinutes],
      tags: changes.tags ?? this.tags,
      longRunning: changes.longRunning ?? this.longRunning,
      data: { ...this.data },
      artifactLinks: changes.artifactLinks ?? [...this.artifactLinks],
      subtaskIds: changes.subtaskIds ?? [...this.subtaskIds],
      blocksIds: changes.blocksIds ?? [...this.blocksIds],
      parentIds: [...this.parentIds],
      blockedByIds: [...this.blockedByIds],
      occurrence: detachOccurrence(this.occurrence),
      revision: this.revision + 1,
    });
  }
}
