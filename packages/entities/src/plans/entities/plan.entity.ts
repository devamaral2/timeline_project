import {
  DEFAULT_WORK_ITEM_STATUS,
  type WorkItemStatus,
} from "../../work-items/types/work-item-status";
import {
  DEFAULT_WORK_ITEM_PRIORITY,
  type WorkItemPriority,
} from "../../work-items/types/work-item-priority";
import { TagList } from "../../events/value-objects/tag-list";
import { PlanId } from "../value-objects/plan-id";
import { PlanValidationError } from "../errors/plan.errors";

export interface PlanCreateProps {
  id?: string;
  userId: string;
  name: string;
  description: string;
  status?: WorkItemStatus;
  priority?: WorkItemPriority;
  tags: string[];
  startedAt?: Date;
  estimatedFinishAt?: Date;
  finishedAt?: Date;
  dependsOnPlanIds?: string[];
}

export interface PlanRehydrateProps extends PlanCreateProps {
  revision: number;
}

export interface PlanReviseChanges {
  name?: string;
  description?: string;
  status?: WorkItemStatus;
  priority?: WorkItemPriority;
  tags?: string[];
  startedAt?: Date;
  estimatedFinishAt?: Date;
  finishedAt?: Date;
  dependsOnPlanIds?: string[];
}

interface PlanBuildProps {
  id: string;
  userId: string;
  name: string;
  description: string;
  status: WorkItemStatus;
  priority: WorkItemPriority;
  tags: string[];
  startedAt: Date | undefined;
  estimatedFinishAt: Date | undefined;
  finishedAt: Date | undefined;
  dependsOnPlanIds: string[];
  revision: number;
}

export class Plan {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly description: string;
  readonly status: WorkItemStatus;
  readonly priority: WorkItemPriority;
  readonly tags: string[];
  readonly startedAt: Date | undefined;
  readonly estimatedFinishAt: Date | undefined;
  readonly finishedAt: Date | undefined;
  readonly dependsOnPlanIds: readonly string[];
  readonly revision: number;

  private constructor(props: PlanBuildProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.name = props.name;
    this.description = props.description;
    this.status = props.status;
    this.priority = props.priority;
    this.tags = props.tags;
    this.startedAt = props.startedAt;
    this.estimatedFinishAt = props.estimatedFinishAt;
    this.finishedAt = props.finishedAt;
    this.dependsOnPlanIds = props.dependsOnPlanIds;
    this.revision = props.revision;
  }

  private static build(props: PlanBuildProps): Plan {
    if (props.startedAt && props.finishedAt && props.finishedAt < props.startedAt) {
      throw new PlanValidationError("finishedAt must be equal to or after startedAt");
    }
    if (!Number.isInteger(props.revision) || props.revision < 1) {
      throw new PlanValidationError("Plan revision must be an integer >= 1");
    }
    if (props.dependsOnPlanIds.includes(props.id)) {
      throw new PlanValidationError("Plan cannot depend on itself");
    }

    return new Plan({
      ...props,
      tags: TagList.create(props.tags),
      dependsOnPlanIds: Array.from(new Set(props.dependsOnPlanIds)),
    });
  }

  static create(props: PlanCreateProps): Plan {
    return Plan.build({
      id: props.id ?? PlanId.create(),
      userId: props.userId,
      name: props.name,
      description: props.description,
      status: props.status ?? DEFAULT_WORK_ITEM_STATUS,
      priority: props.priority ?? DEFAULT_WORK_ITEM_PRIORITY,
      tags: props.tags,
      startedAt: props.startedAt,
      estimatedFinishAt: props.estimatedFinishAt,
      finishedAt: props.finishedAt,
      dependsOnPlanIds: props.dependsOnPlanIds ?? [],
      revision: 1,
    });
  }

  static rehydrate(props: PlanRehydrateProps): Plan {
    return Plan.build({
      id: props.id ?? PlanId.create(),
      userId: props.userId,
      name: props.name,
      description: props.description,
      status: props.status ?? DEFAULT_WORK_ITEM_STATUS,
      priority: props.priority ?? DEFAULT_WORK_ITEM_PRIORITY,
      tags: props.tags,
      startedAt: props.startedAt,
      estimatedFinishAt: props.estimatedFinishAt,
      finishedAt: props.finishedAt,
      dependsOnPlanIds: props.dependsOnPlanIds ?? [],
      revision: props.revision,
    });
  }

  revise(changes: PlanReviseChanges): Plan {
    return Plan.build({
      id: this.id,
      userId: this.userId,
      name: changes.name ?? this.name,
      description: changes.description ?? this.description,
      status: changes.status ?? this.status,
      priority: changes.priority ?? this.priority,
      tags: changes.tags ?? this.tags,
      startedAt: changes.startedAt !== undefined ? changes.startedAt : this.startedAt,
      estimatedFinishAt:
        changes.estimatedFinishAt !== undefined ? changes.estimatedFinishAt : this.estimatedFinishAt,
      finishedAt: changes.finishedAt !== undefined ? changes.finishedAt : this.finishedAt,
      dependsOnPlanIds: changes.dependsOnPlanIds ?? [...this.dependsOnPlanIds],
      revision: this.revision + 1,
    });
  }
}
