import {
  AGENT_KINDS,
  AGENT_STATUSES,
  HUMAN_KINDS,
  HUMAN_STATUSES,
  PRIORITIES,
  type Actor,
  type TaskKind,
  type TaskPriority,
  type TaskStatus,
} from "../../sets";
import { defaultTaskDurationMinutesFor } from "../types/default-task-duration";
import {
  DEFAULT_TASK_NOTIFICATION_OFFSETS_MINUTES,
  isNotificationOffsetMinutes,
  type NotificationOffsetMinutes,
} from "../types/notification-offset-minutes";
import { normalizeArtifactLinks, type ArtifactLink } from "../types/artifact-link";
import { TagList } from "../value-objects/tag-list";
import { TaskId } from "../value-objects/task-id";
import { TaskValidationError } from "../errors/task.errors";
import { detachOccurrence, type OccurrenceLink } from "../../recurrences/types/occurrence-link";

export const MAX_TASK_LOCATION_LENGTH = 300;
export const DEFAULT_TASK_KIND: TaskKind = "common";
export const DEFAULT_TASK_PRIORITY: TaskPriority = "medium";

/** O bloco de uma tarefa na agenda dura no maximo isto; acima disso, e uma tarefa longa. */
export const MAX_TASK_BLOCK_DAYS = 31;
const MAX_TASK_BLOCK_MS = MAX_TASK_BLOCK_DAYS * 24 * 60 * 60 * 1000;

export interface TaskCreateProps {
  id?: string;
  userId: string;
  /** Quem executa. Ausente e uma pessoa. */
  actor?: Actor;
  kind?: TaskKind;
  /** Ausente numa tarefa de pessoa, ele e de referencia: so marca um horario. */
  status?: TaskStatus;
  priority?: TaskPriority;
  name: string;
  description?: string;
  /** Onde acontece, em texto livre que o Google Maps entende. So tarefa de pessoa tem. */
  location?: string;
  /** Inicio planejado. */
  startedAt?: Date;
  /** Fim planejado: o fim do bloco ou, na tarefa longa, o prazo. */
  estimatedFinishAt?: Date;
  /** Conclusao real. */
  finishedAt?: Date;
  notifyOffsetsMinutes?: NotificationOffsetMinutes[];
  tags?: string[];
  longRunning?: boolean;
  /** Pequeno: resumo, agente interno do passo, contexto de tela. */
  data?: Record<string, unknown>;
  /** Os artefatos da tarefa, na ordem em que aparecem. */
  artifactLinks?: ArtifactLink[];
  occurrence?: OccurrenceLink;
}

export interface TaskRehydrateProps extends TaskCreateProps {
  actor: Actor;
  kind: TaskKind;
  revision: number;
  /** As tarefas de que este se segue ("segue-se de"). A sequencia nao e campo da tarefa: aqui e so leitura. */
  previousIds?: string[];
  /** As tarefas que se seguem a este ("da sequencia a"). Idem: so leitura. */
  nextIds?: string[];
}

/** `null` apaga o campo. Sem status, a tarefa volta a ser de referencia. */
export interface TaskReviseChanges {
  kind?: TaskKind;
  status?: TaskStatus | null;
  priority?: TaskPriority;
  name?: string;
  description?: string;
  location?: string;
  startedAt?: Date | null;
  estimatedFinishAt?: Date | null;
  finishedAt?: Date | null;
  notifyOffsetsMinutes?: NotificationOffsetMinutes[];
  tags?: string[];
  longRunning?: boolean;
  artifactLinks?: ArtifactLink[];
}

interface TaskBuildProps {
  id: string;
  userId: string;
  actor: Actor;
  kind: TaskKind;
  status: TaskStatus | undefined;
  priority: TaskPriority;
  name: string;
  description: string;
  location: string;
  startedAt: Date | undefined;
  estimatedFinishAt: Date | undefined;
  finishedAt: Date | undefined;
  notifyOffsetsMinutes: NotificationOffsetMinutes[];
  tags: string[];
  longRunning: boolean;
  data: Record<string, unknown>;
  artifactLinks: ArtifactLink[];
  previousIds: string[];
  nextIds: string[];
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
 * acao: com status, a tarefa e acompanhada (o que antes era so uma tarefa com status); sem
 * status, so marca um horario na agenda.
 *
 * Este agregado guarda os artefatos da tarefa. A ordem entre tarefas (a
 * relacao `precedes`) nao e campo de nenhuma delas: o agregado so a le, em
 * `previousIds` e `nextIds`, e quem a muda e o lote, sem revisar ninguem.
 */
export class Task {
  readonly id: string;
  readonly userId: string;
  readonly actor: Actor;
  readonly kind: TaskKind;
  readonly status: TaskStatus | undefined;
  readonly priority: TaskPriority;
  readonly name: string;
  readonly description: string;
  readonly location: string;
  readonly startedAt: Date | undefined;
  readonly estimatedFinishAt: Date | undefined;
  readonly finishedAt: Date | undefined;
  readonly notifyOffsetsMinutes: readonly NotificationOffsetMinutes[];
  readonly tags: string[];
  readonly longRunning: boolean;
  readonly data: Readonly<Record<string, unknown>>;
  readonly artifactLinks: readonly ArtifactLink[];
  /** As tarefas de que este se segue. */
  readonly previousIds: readonly string[];
  /** As tarefas que se seguem a este. */
  readonly nextIds: readonly string[];
  /** Presente quando a tarefa e uma ocorrencia de uma serie. */
  readonly occurrence: OccurrenceLink | undefined;
  readonly revision: number;

  private constructor(props: TaskBuildProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.actor = props.actor;
    this.kind = props.kind;
    this.status = props.status;
    this.priority = props.priority;
    this.name = props.name;
    this.description = props.description;
    this.location = props.location;
    this.startedAt = props.startedAt;
    this.estimatedFinishAt = props.estimatedFinishAt;
    this.finishedAt = props.finishedAt;
    this.notifyOffsetsMinutes = props.notifyOffsetsMinutes;
    this.tags = props.tags;
    this.longRunning = props.longRunning;
    this.data = props.data;
    this.artifactLinks = props.artifactLinks;
    this.previousIds = props.previousIds;
    this.nextIds = props.nextIds;
    this.occurrence = props.occurrence;
    this.revision = props.revision;
  }

  /** Tarefa de referencia: sem status, so marca um horario. So existe para pessoa. */
  get isReference(): boolean {
    return this.status === undefined;
  }

  private static build(props: TaskBuildProps): Task {
    if (!Number.isInteger(props.revision) || props.revision < 1) {
      throw new TaskValidationError("Task revision must be an integer >= 1");
    }
    if (!includes(PRIORITIES, props.priority)) {
      throw new TaskValidationError(`Invalid task priority: ${props.priority}`);
    }
    if (props.actor === "human") {
      if (!includes(HUMAN_KINDS, props.kind)) {
        throw new TaskValidationError(`Invalid kind for a human task: ${props.kind}`);
      }
      if (props.status !== undefined && !includes(HUMAN_STATUSES, props.status)) {
        throw new TaskValidationError(`Invalid status for a human task: ${props.status}`);
      }
    } else {
      if (!includes(AGENT_KINDS, props.kind)) {
        throw new TaskValidationError(`Invalid kind for a agent task: ${props.kind}`);
      }
      if (!includes(AGENT_STATUSES, props.status)) {
        throw new TaskValidationError("A agent task always has one of the agent statuses");
      }
    }

    if (props.location.length > MAX_TASK_LOCATION_LENGTH) {
      throw new TaskValidationError(`Task location is longer than ${MAX_TASK_LOCATION_LENGTH} characters`);
    }
    if (props.actor !== "human" && props.location !== "") {
      throw new TaskValidationError("Only a human task has a location");
    }

    if (props.longRunning) {
      if (props.actor !== "human") throw new TaskValidationError("Only a human task can be long-running");
      if (props.status === undefined) throw new TaskValidationError("A long-running task always has a status");
      if (props.status === "missed") throw new TaskValidationError("A long-running task is never missed");
      if (props.occurrence) throw new TaskValidationError("A long-running task does not repeat");
      if (!props.estimatedFinishAt && props.notifyOffsetsMinutes.length > 0) {
        throw new TaskValidationError("A long-running task without a deadline has no notifications");
      }
    } else {
      if (props.status === undefined && !props.startedAt) {
        throw new TaskValidationError("A reference task requires startedAt");
      }
      if (props.startedAt && props.estimatedFinishAt) {
        const span = props.estimatedFinishAt.getTime() - props.startedAt.getTime();
        if (span < 0) throw new TaskValidationError("estimatedFinishAt must be equal to or after startedAt");
        if (span > MAX_TASK_BLOCK_MS) {
          throw new TaskValidationError(`A task longer than ${MAX_TASK_BLOCK_DAYS} days must be long-running`);
        }
      }
    }

    if (!props.notifyOffsetsMinutes.every(isNotificationOffsetMinutes)) {
      throw new TaskValidationError("Invalid notification offset");
    }
    if (props.previousIds.includes(props.id) || props.nextIds.includes(props.id)) {
      throw new TaskValidationError("Task cannot follow itself");
    }
    if (typeof props.data !== "object" || props.data === null || Array.isArray(props.data)) {
      throw new TaskValidationError("Task data must be an object");
    }

    return new Task({
      ...props,
      tags: TagList.create(props.tags),
      notifyOffsetsMinutes: Array.from(new Set(props.notifyOffsetsMinutes)),
      artifactLinks: normalizeArtifactLinks(props.artifactLinks),
      previousIds: unique(props.previousIds),
      nextIds: unique(props.nextIds),
    });
  }

  /**
   * Uma tarefa de referencia nova nunca fica sem fim planejado: sem ele,
   * estimamos pela duracao tipica do `kind`. Uma tarefa longa nasce `todo`.
   */
  static create(props: TaskCreateProps): Task {
    const actor = props.actor ?? "human";
    const kind = props.kind ?? DEFAULT_TASK_KIND;
    const longRunning = props.longRunning ?? false;
    const status = props.status ?? (longRunning ? "todo" : undefined);
    const reference = status === undefined;
    const estimatedFinishAt =
      props.estimatedFinishAt ??
      (reference && props.startedAt
        ? new Date(props.startedAt.getTime() + defaultTaskDurationMinutesFor(kind) * 60_000)
        : undefined);

    return Task.build({
      id: props.id ?? TaskId.create(),
      userId: props.userId,
      actor,
      kind,
      status,
      priority: props.priority ?? DEFAULT_TASK_PRIORITY,
      name: props.name,
      description: props.description ?? "",
      location: props.location?.trim() ?? "",
      startedAt: props.startedAt,
      estimatedFinishAt,
      finishedAt: props.finishedAt,
      notifyOffsetsMinutes: props.notifyOffsetsMinutes ?? (reference ? DEFAULT_TASK_NOTIFICATION_OFFSETS_MINUTES : []),
      tags: props.tags ?? [],
      longRunning,
      data: props.data ?? {},
      artifactLinks: props.artifactLinks ?? [],
      previousIds: [],
      nextIds: [],
      occurrence: props.occurrence,
      revision: 1,
    });
  }

  /** Nao reaplica nenhum default de tarefa nova: a linha volta como foi gravada. */
  static rehydrate(props: TaskRehydrateProps): Task {
    return Task.build({
      id: props.id ?? TaskId.create(),
      userId: props.userId,
      actor: props.actor,
      kind: props.kind,
      status: props.status,
      priority: props.priority ?? DEFAULT_TASK_PRIORITY,
      name: props.name,
      description: props.description ?? "",
      location: props.location?.trim() ?? "",
      startedAt: props.startedAt,
      estimatedFinishAt: props.estimatedFinishAt,
      finishedAt: props.finishedAt,
      notifyOffsetsMinutes: props.notifyOffsetsMinutes ?? [],
      tags: props.tags ?? [],
      longRunning: props.longRunning ?? false,
      data: props.data ?? {},
      artifactLinks: props.artifactLinks ?? [],
      previousIds: props.previousIds ?? [],
      nextIds: props.nextIds ?? [],
      occurrence: props.occurrence,
      revision: props.revision,
    });
  }

  /**
   * Toda revisao e uma edicao do usuario, e por isso destaca a ocorrencia da
   * serie. So tarefas de pessoa sao revisadas: os de agente mudam pelo proprio
   * agente.
   */
  revise(changes: TaskReviseChanges): Task {
    if (this.actor !== "human") throw new TaskValidationError("A agent task cannot be edited");
    const pick = <T>(change: T | null | undefined, current: T | undefined): T | undefined =>
      change === undefined ? current : (change ?? undefined);

    return Task.build({
      id: this.id,
      userId: this.userId,
      actor: this.actor,
      kind: changes.kind ?? this.kind,
      status: pick(changes.status, this.status),
      priority: changes.priority ?? this.priority,
      name: changes.name ?? this.name,
      description: changes.description ?? this.description,
      location: changes.location === undefined ? this.location : changes.location.trim(),
      startedAt: pick(changes.startedAt, this.startedAt),
      estimatedFinishAt: pick(changes.estimatedFinishAt, this.estimatedFinishAt),
      finishedAt: pick(changes.finishedAt, this.finishedAt),
      notifyOffsetsMinutes: changes.notifyOffsetsMinutes ?? [...this.notifyOffsetsMinutes],
      tags: changes.tags ?? this.tags,
      longRunning: changes.longRunning ?? this.longRunning,
      data: { ...this.data },
      artifactLinks: changes.artifactLinks ?? [...this.artifactLinks],
      previousIds: [...this.previousIds],
      nextIds: [...this.nextIds],
      occurrence: detachOccurrence(this.occurrence),
      revision: this.revision + 1,
    });
  }
}
