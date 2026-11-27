import { acceptsSituation } from "../../agent-status";
import {
  AGENT_KINDS,
  AGENT_STATUSES,
  HUMAN_KINDS,
  HUMAN_STATUSES,
  PRIORITIES,
  type Actor,
  type Situation,
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
  /** Ausente numa tarefa de pessoa, ela e de referencia: so marca um horario. */
  status?: TaskStatus;
  /** So o pedido de agente que terminou tem (`acceptsSituation`). */
  situation?: Situation;
  priority?: TaskPriority;
  name: string;
  description?: string;
  /**
   * Onde acontece, em texto livre que o Google Maps entende. So tarefa de pessoa tem, e so quando alguem o informa:
   * ausente ou vazio, a tarefa fica sem local.
   */
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
  /**
   * O projeto escolhido (id). Ausente, quem grava resolve: a ocorrencia fica no projeto da serie e as demais, em
   * `personal`; `null` pede o `personal` de proposito. Quem le uma tarefa gravada sempre recebe o id.
   */
  projectId?: string | null;
  /** Ausente, e o agora. */
  now?: Date;
}

export interface TaskRehydrateProps extends Omit<TaskCreateProps, "now"> {
  actor: Actor;
  kind: TaskKind;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
  /** A tarefa principal desta. A hierarquia nao e campo da tarefa: aqui e so leitura. */
  parentId?: string;
  /** As subtarefas desta. Idem: so leitura. */
  subtaskIds?: string[];
}

/** `null` apaga o campo. Sem status, a tarefa volta a ser de referencia. */
export interface TaskReviseChanges {
  kind?: TaskKind;
  status?: TaskStatus | null;
  priority?: TaskPriority;
  name?: string;
  description?: string;
  /** `null` ou vazio tira o local. */
  location?: string | null;
  startedAt?: Date | null;
  estimatedFinishAt?: Date | null;
  finishedAt?: Date | null;
  notifyOffsetsMinutes?: NotificationOffsetMinutes[];
  tags?: string[];
  longRunning?: boolean;
  artifactLinks?: ArtifactLink[];
  /** Ausente nao muda; `null` devolve a tarefa a `personal`. */
  projectId?: string | null;
}

interface TaskBuildProps {
  id: string;
  userId: string;
  actor: Actor;
  kind: TaskKind;
  status: TaskStatus | undefined;
  situation: Situation | undefined;
  priority: TaskPriority;
  name: string;
  description: string;
  location: string | undefined;
  startedAt: Date | undefined;
  estimatedFinishAt: Date | undefined;
  finishedAt: Date | undefined;
  notifyOffsetsMinutes: NotificationOffsetMinutes[];
  tags: string[];
  longRunning: boolean;
  data: Record<string, unknown>;
  artifactLinks: ArtifactLink[];
  parentId: string | undefined;
  subtaskIds: string[];
  occurrence: OccurrenceLink | undefined;
  projectId: string | null | undefined;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}

/** O local como fica guardado: sem espacos nas pontas, e ausente quando nao sobra texto. */
function locationOf(text: string | null | undefined): string | undefined {
  return text?.trim() || undefined;
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
 * Este agregado guarda os artefatos da tarefa. A hierarquia entre tarefas (a
 * relacao `subtask`) nao e campo de nenhuma delas: o agregado so a le, em
 * `parentId` e `subtaskIds`, e quem a muda e o lote, sem revisar ninguem.
 */
export class Task {
  readonly id: string;
  readonly userId: string;
  readonly actor: Actor;
  readonly kind: TaskKind;
  readonly status: TaskStatus | undefined;
  /** O que o usuario decidiu do pedido que terminou. Ausente nas demais tarefas. */
  readonly situation: Situation | undefined;
  readonly priority: TaskPriority;
  readonly name: string;
  readonly description: string;
  /** Ausente: ninguem informou onde a tarefa acontece. */
  readonly location: string | undefined;
  readonly startedAt: Date | undefined;
  readonly estimatedFinishAt: Date | undefined;
  readonly finishedAt: Date | undefined;
  readonly notifyOffsetsMinutes: readonly NotificationOffsetMinutes[];
  readonly tags: string[];
  readonly longRunning: boolean;
  readonly data: Readonly<Record<string, unknown>>;
  readonly artifactLinks: readonly ArtifactLink[];
  /** A tarefa principal: no maximo uma. */
  readonly parentId: string | undefined;
  /** As subtarefas. */
  readonly subtaskIds: readonly string[];
  /** Presente quando a tarefa e uma ocorrencia de uma serie. */
  readonly occurrence: OccurrenceLink | undefined;
  /**
   * O projeto, pelo id. Ausente numa tarefa que ainda nao foi gravada e que ninguem pos num projeto (quem grava
   * resolve); `null` numa tarefa revisada para voltar a `personal`.
   */
  readonly projectId: string | null | undefined;
  readonly revision: number;
  readonly createdAt: Date;
  /** A ultima gravacao: cada revisao a avanca. */
  readonly updatedAt: Date;

  private constructor(props: TaskBuildProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.actor = props.actor;
    this.kind = props.kind;
    this.status = props.status;
    this.situation = props.situation;
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
    this.parentId = props.parentId;
    this.subtaskIds = props.subtaskIds;
    this.occurrence = props.occurrence;
    this.projectId = props.projectId;
    this.revision = props.revision;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
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

    if (props.situation !== undefined && !acceptsSituation(props)) {
      throw new TaskValidationError("Only a finished agent request has a situation");
    }

    if (props.location !== undefined && props.location.length > MAX_TASK_LOCATION_LENGTH) {
      throw new TaskValidationError(`Task location is longer than ${MAX_TASK_LOCATION_LENGTH} characters`);
    }
    if (props.actor !== "human" && props.location !== undefined) {
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
    if (props.parentId === props.id || props.subtaskIds.includes(props.id)) {
      throw new TaskValidationError("A task cannot be its own subtask");
    }
    if (typeof props.data !== "object" || props.data === null || Array.isArray(props.data)) {
      throw new TaskValidationError("Task data must be an object");
    }
    if (props.updatedAt.getTime() < props.createdAt.getTime()) {
      throw new TaskValidationError("updatedAt must be equal to or after createdAt");
    }

    return new Task({
      ...props,
      tags: TagList.create(props.tags),
      notifyOffsetsMinutes: Array.from(new Set(props.notifyOffsetsMinutes)),
      artifactLinks: normalizeArtifactLinks(props.artifactLinks),
      subtaskIds: unique(props.subtaskIds),
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
    const now = props.now ?? new Date();
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
      situation: props.situation,
      priority: props.priority ?? DEFAULT_TASK_PRIORITY,
      name: props.name,
      description: props.description ?? "",
      location: locationOf(props.location),
      startedAt: props.startedAt,
      estimatedFinishAt,
      finishedAt: props.finishedAt,
      notifyOffsetsMinutes: props.notifyOffsetsMinutes ?? (reference ? DEFAULT_TASK_NOTIFICATION_OFFSETS_MINUTES : []),
      tags: props.tags ?? [],
      longRunning,
      data: props.data ?? {},
      artifactLinks: props.artifactLinks ?? [],
      parentId: undefined,
      subtaskIds: [],
      occurrence: props.occurrence,
      projectId: props.projectId,
      revision: 1,
      createdAt: now,
      updatedAt: now,
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
      situation: props.situation,
      priority: props.priority ?? DEFAULT_TASK_PRIORITY,
      name: props.name,
      description: props.description ?? "",
      location: locationOf(props.location),
      startedAt: props.startedAt,
      estimatedFinishAt: props.estimatedFinishAt,
      finishedAt: props.finishedAt,
      notifyOffsetsMinutes: props.notifyOffsetsMinutes ?? [],
      tags: props.tags ?? [],
      longRunning: props.longRunning ?? false,
      data: props.data ?? {},
      artifactLinks: props.artifactLinks ?? [],
      parentId: props.parentId,
      subtaskIds: props.subtaskIds ?? [],
      occurrence: props.occurrence,
      projectId: props.projectId,
      revision: props.revision,
      createdAt: props.createdAt,
      updatedAt: props.updatedAt,
    });
  }

  /**
   * Toda revisao e uma edicao do usuario, e por isso destaca a ocorrencia da
   * serie. So tarefas de pessoa sao revisadas: as de agente mudam pelo proprio
   * agente.
   */
  revise(changes: TaskReviseChanges, now: Date = new Date()): Task {
    if (this.actor !== "human") throw new TaskValidationError("A agent task cannot be edited");
    const pick = <T>(change: T | null | undefined, current: T | undefined): T | undefined =>
      change === undefined ? current : (change ?? undefined);

    return Task.build({
      id: this.id,
      userId: this.userId,
      actor: this.actor,
      kind: changes.kind ?? this.kind,
      status: pick(changes.status, this.status),
      situation: undefined,
      priority: changes.priority ?? this.priority,
      name: changes.name ?? this.name,
      description: changes.description ?? this.description,
      location: changes.location === undefined ? this.location : locationOf(changes.location),
      startedAt: pick(changes.startedAt, this.startedAt),
      estimatedFinishAt: pick(changes.estimatedFinishAt, this.estimatedFinishAt),
      finishedAt: pick(changes.finishedAt, this.finishedAt),
      notifyOffsetsMinutes: changes.notifyOffsetsMinutes ?? [...this.notifyOffsetsMinutes],
      tags: changes.tags ?? this.tags,
      longRunning: changes.longRunning ?? this.longRunning,
      data: { ...this.data },
      artifactLinks: changes.artifactLinks ?? [...this.artifactLinks],
      parentId: this.parentId,
      subtaskIds: [...this.subtaskIds],
      occurrence: detachOccurrence(this.occurrence),
      projectId: changes.projectId === undefined ? this.projectId : changes.projectId,
      revision: this.revision + 1,
      createdAt: this.createdAt,
      // Um relogio que volta nao faz a edicao parecer anterior a criacao.
      updatedAt: now.getTime() < this.createdAt.getTime() ? this.createdAt : now,
    });
  }
}
