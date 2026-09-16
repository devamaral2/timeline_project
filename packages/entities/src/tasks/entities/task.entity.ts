import {
  DEFAULT_WORK_ITEM_STATUS,
  type WorkItemStatus,
} from "../../work-items/types/work-item-status";
import {
  DEFAULT_WORK_ITEM_PRIORITY,
  type WorkItemPriority,
} from "../../work-items/types/work-item-priority";
import { TagList } from "../../events/value-objects/tag-list";
import { TaskId } from "../value-objects/task-id";
import { TaskValidationError } from "../errors/task.errors";

export interface TaskCreateProps {
  id?: string;
  userId: string;
  parentTaskId?: string;
  name: string;
  description: string;
  status?: WorkItemStatus;
  priority?: WorkItemPriority;
  tags: string[];
  startedAt?: Date;
  estimatedFinishAt?: Date;
  finishedAt?: Date;
  dependsOnTaskIds?: string[];
}

export interface TaskRehydrateProps extends TaskCreateProps {
  revision: number;
}

export interface TaskReviseChanges {
  parentTaskId?: string | null;
  name?: string;
  description?: string;
  status?: WorkItemStatus;
  priority?: WorkItemPriority;
  tags?: string[];
  startedAt?: Date;
  estimatedFinishAt?: Date;
  finishedAt?: Date;
  dependsOnTaskIds?: string[];
}

interface TaskBuildProps {
  id: string;
  userId: string;
  parentTaskId: string | undefined;
  name: string;
  description: string;
  status: WorkItemStatus;
  priority: WorkItemPriority;
  tags: string[];
  startedAt: Date | undefined;
  estimatedFinishAt: Date | undefined;
  finishedAt: Date | undefined;
  dependsOnTaskIds: string[];
  revision: number;
}

/**
 * Tarefa. `parentTaskId` e a subtarefa: uma tarefa aponta para a tarefa de que
 * e filha, e quem nao aponta para ninguem e uma tarefa de topo. Nao ha limite
 * de profundidade — o que a entidade barra e a auto-referencia direta; ciclos
 * mais longos sao barrados na hora de escolher o pai (`assert-parent-task.ts`
 * em apps/api), que e o unico caminho capaz de cria-los.
 */
export class Task {
  readonly id: string;
  readonly userId: string;
  readonly parentTaskId: string | undefined;
  readonly name: string;
  readonly description: string;
  readonly status: WorkItemStatus;
  readonly priority: WorkItemPriority;
  readonly tags: string[];
  readonly startedAt: Date | undefined;
  readonly estimatedFinishAt: Date | undefined;
  readonly finishedAt: Date | undefined;
  readonly dependsOnTaskIds: readonly string[];
  readonly revision: number;

  private constructor(props: TaskBuildProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.parentTaskId = props.parentTaskId;
    this.name = props.name;
    this.description = props.description;
    this.status = props.status;
    this.priority = props.priority;
    this.tags = props.tags;
    this.startedAt = props.startedAt;
    this.estimatedFinishAt = props.estimatedFinishAt;
    this.finishedAt = props.finishedAt;
    this.dependsOnTaskIds = props.dependsOnTaskIds;
    this.revision = props.revision;
  }

  private static build(props: TaskBuildProps): Task {
    if (props.startedAt && props.finishedAt && props.finishedAt < props.startedAt) {
      throw new TaskValidationError("finishedAt must be equal to or after startedAt");
    }
    if (!Number.isInteger(props.revision) || props.revision < 1) {
      throw new TaskValidationError("Task revision must be an integer >= 1");
    }
    if (props.dependsOnTaskIds.includes(props.id)) {
      throw new TaskValidationError("Task cannot depend on itself");
    }
    if (props.parentTaskId === props.id) {
      throw new TaskValidationError("Task cannot be its own parent");
    }

    return new Task({
      ...props,
      tags: TagList.create(props.tags),
      dependsOnTaskIds: Array.from(new Set(props.dependsOnTaskIds)),
    });
  }

  static create(props: TaskCreateProps): Task {
    return Task.build({
      id: props.id ?? TaskId.create(),
      userId: props.userId,
      parentTaskId: props.parentTaskId,
      name: props.name,
      description: props.description,
      status: props.status ?? DEFAULT_WORK_ITEM_STATUS,
      priority: props.priority ?? DEFAULT_WORK_ITEM_PRIORITY,
      tags: props.tags,
      startedAt: props.startedAt,
      estimatedFinishAt: props.estimatedFinishAt,
      finishedAt: props.finishedAt,
      dependsOnTaskIds: props.dependsOnTaskIds ?? [],
      revision: 1,
    });
  }

  static rehydrate(props: TaskRehydrateProps): Task {
    return Task.build({
      id: props.id ?? TaskId.create(),
      userId: props.userId,
      parentTaskId: props.parentTaskId,
      name: props.name,
      description: props.description,
      status: props.status ?? DEFAULT_WORK_ITEM_STATUS,
      priority: props.priority ?? DEFAULT_WORK_ITEM_PRIORITY,
      tags: props.tags,
      startedAt: props.startedAt,
      estimatedFinishAt: props.estimatedFinishAt,
      finishedAt: props.finishedAt,
      dependsOnTaskIds: props.dependsOnTaskIds ?? [],
      revision: props.revision,
    });
  }

  revise(changes: TaskReviseChanges): Task {
    return Task.build({
      id: this.id,
      userId: this.userId,
      parentTaskId: changes.parentTaskId !== undefined ? (changes.parentTaskId ?? undefined) : this.parentTaskId,
      name: changes.name ?? this.name,
      description: changes.description ?? this.description,
      status: changes.status ?? this.status,
      priority: changes.priority ?? this.priority,
      tags: changes.tags ?? this.tags,
      startedAt: changes.startedAt !== undefined ? changes.startedAt : this.startedAt,
      estimatedFinishAt:
        changes.estimatedFinishAt !== undefined ? changes.estimatedFinishAt : this.estimatedFinishAt,
      finishedAt: changes.finishedAt !== undefined ? changes.finishedAt : this.finishedAt,
      dependsOnTaskIds: changes.dependsOnTaskIds ?? [...this.dependsOnTaskIds],
      revision: this.revision + 1,
    });
  }
}
