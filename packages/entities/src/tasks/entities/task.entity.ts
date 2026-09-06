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
  planId?: string;
  name: string;
  description: string;
  status?: WorkItemStatus;
  priority?: WorkItemPriority;
  tags: string[];
  startedAt?: Date;
  estimatedFinishAt?: Date;
  finishedAt?: Date;
}

export interface TaskRehydrateProps extends TaskCreateProps {
  revision: number;
}

export interface TaskReviseChanges {
  planId?: string | null;
  name?: string;
  description?: string;
  status?: WorkItemStatus;
  priority?: WorkItemPriority;
  tags?: string[];
  startedAt?: Date;
  estimatedFinishAt?: Date;
  finishedAt?: Date;
}

interface TaskBuildProps {
  id: string;
  userId: string;
  planId: string | undefined;
  name: string;
  description: string;
  status: WorkItemStatus;
  priority: WorkItemPriority;
  tags: string[];
  startedAt: Date | undefined;
  estimatedFinishAt: Date | undefined;
  finishedAt: Date | undefined;
  revision: number;
}

export class Task {
  readonly id: string;
  readonly userId: string;
  readonly planId: string | undefined;
  readonly name: string;
  readonly description: string;
  readonly status: WorkItemStatus;
  readonly priority: WorkItemPriority;
  readonly tags: string[];
  readonly startedAt: Date | undefined;
  readonly estimatedFinishAt: Date | undefined;
  readonly finishedAt: Date | undefined;
  readonly revision: number;

  private constructor(props: TaskBuildProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.planId = props.planId;
    this.name = props.name;
    this.description = props.description;
    this.status = props.status;
    this.priority = props.priority;
    this.tags = props.tags;
    this.startedAt = props.startedAt;
    this.estimatedFinishAt = props.estimatedFinishAt;
    this.finishedAt = props.finishedAt;
    this.revision = props.revision;
  }

  private static build(props: TaskBuildProps): Task {
    if (props.startedAt && props.finishedAt && props.finishedAt < props.startedAt) {
      throw new TaskValidationError("finishedAt must be equal to or after startedAt");
    }
    if (!Number.isInteger(props.revision) || props.revision < 1) {
      throw new TaskValidationError("Task revision must be an integer >= 1");
    }

    return new Task({
      ...props,
      tags: TagList.create(props.tags),
    });
  }

  static create(props: TaskCreateProps): Task {
    return Task.build({
      id: props.id ?? TaskId.create(),
      userId: props.userId,
      planId: props.planId,
      name: props.name,
      description: props.description,
      status: props.status ?? DEFAULT_WORK_ITEM_STATUS,
      priority: props.priority ?? DEFAULT_WORK_ITEM_PRIORITY,
      tags: props.tags,
      startedAt: props.startedAt,
      estimatedFinishAt: props.estimatedFinishAt,
      finishedAt: props.finishedAt,
      revision: 1,
    });
  }

  static rehydrate(props: TaskRehydrateProps): Task {
    return Task.build({
      id: props.id ?? TaskId.create(),
      userId: props.userId,
      planId: props.planId,
      name: props.name,
      description: props.description,
      status: props.status ?? DEFAULT_WORK_ITEM_STATUS,
      priority: props.priority ?? DEFAULT_WORK_ITEM_PRIORITY,
      tags: props.tags,
      startedAt: props.startedAt,
      estimatedFinishAt: props.estimatedFinishAt,
      finishedAt: props.finishedAt,
      revision: props.revision,
    });
  }

  revise(changes: TaskReviseChanges): Task {
    return Task.build({
      id: this.id,
      userId: this.userId,
      planId: changes.planId !== undefined ? (changes.planId ?? undefined) : this.planId,
      name: changes.name ?? this.name,
      description: changes.description ?? this.description,
      status: changes.status ?? this.status,
      priority: changes.priority ?? this.priority,
      tags: changes.tags ?? this.tags,
      startedAt: changes.startedAt !== undefined ? changes.startedAt : this.startedAt,
      estimatedFinishAt:
        changes.estimatedFinishAt !== undefined ? changes.estimatedFinishAt : this.estimatedFinishAt,
      finishedAt: changes.finishedAt !== undefined ? changes.finishedAt : this.finishedAt,
      revision: this.revision + 1,
    });
  }
}
