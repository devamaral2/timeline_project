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
import { detachOccurrence, type OccurrenceLink } from "../../recurrences/types/occurrence-link";
import { normalizeNoteLinks, type NoteLink } from "../../notes/types/note-link";
import type { NotificationOffsetMinutes } from "../../notifications/types/notification-offset-minutes";

export interface TaskCreateProps {
  id?: string;
  userId: string;
  parentTaskId?: string;
  name: string;
  description: string;
  status?: WorkItemStatus;
  priority?: WorkItemPriority;
  notifyOffsetsMinutes?: NotificationOffsetMinutes[];
  tags: string[];
  startedAt?: Date;
  estimatedFinishAt?: Date;
  finishedAt?: Date;
  dependsOnTaskIds?: string[];
  /** As notes da tarefa, na ordem em que aparecem. */
  noteLinks?: NoteLink[];
  occurrence?: OccurrenceLink;
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
  notifyOffsetsMinutes?: NotificationOffsetMinutes[];
  tags?: string[];
  startedAt?: Date;
  estimatedFinishAt?: Date;
  finishedAt?: Date;
  dependsOnTaskIds?: string[];
  noteLinks?: NoteLink[];
}

interface TaskBuildProps {
  id: string;
  userId: string;
  parentTaskId: string | undefined;
  name: string;
  description: string;
  status: WorkItemStatus;
  priority: WorkItemPriority;
  notifyOffsetsMinutes: NotificationOffsetMinutes[];
  tags: string[];
  startedAt: Date | undefined;
  estimatedFinishAt: Date | undefined;
  finishedAt: Date | undefined;
  dependsOnTaskIds: string[];
  noteLinks: NoteLink[];
  occurrence: OccurrenceLink | undefined;
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
  readonly notifyOffsetsMinutes: readonly NotificationOffsetMinutes[];
  readonly tags: string[];
  readonly startedAt: Date | undefined;
  readonly estimatedFinishAt: Date | undefined;
  readonly finishedAt: Date | undefined;
  readonly dependsOnTaskIds: readonly string[];
  readonly noteLinks: readonly NoteLink[];
  /** Presente quando a tarefa e uma ocorrencia de uma serie. */
  readonly occurrence: OccurrenceLink | undefined;
  readonly revision: number;

  private constructor(props: TaskBuildProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.parentTaskId = props.parentTaskId;
    this.name = props.name;
    this.description = props.description;
    this.status = props.status;
    this.priority = props.priority;
    this.notifyOffsetsMinutes = props.notifyOffsetsMinutes;
    this.tags = props.tags;
    this.startedAt = props.startedAt;
    this.estimatedFinishAt = props.estimatedFinishAt;
    this.finishedAt = props.finishedAt;
    this.dependsOnTaskIds = props.dependsOnTaskIds;
    this.noteLinks = props.noteLinks;
    this.occurrence = props.occurrence;
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
      noteLinks: normalizeNoteLinks(props.noteLinks),
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
      notifyOffsetsMinutes: props.notifyOffsetsMinutes ?? [],
      tags: props.tags,
      startedAt: props.startedAt,
      estimatedFinishAt: props.estimatedFinishAt,
      finishedAt: props.finishedAt,
      dependsOnTaskIds: props.dependsOnTaskIds ?? [],
      noteLinks: props.noteLinks ?? [],
      occurrence: props.occurrence,
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
      notifyOffsetsMinutes: props.notifyOffsetsMinutes ?? [],
      tags: props.tags,
      startedAt: props.startedAt,
      estimatedFinishAt: props.estimatedFinishAt,
      finishedAt: props.finishedAt,
      dependsOnTaskIds: props.dependsOnTaskIds ?? [],
      noteLinks: props.noteLinks ?? [],
      occurrence: props.occurrence,
      revision: props.revision,
    });
  }

  /** Toda revisao e uma edicao do usuario, e por isso destaca a ocorrencia da serie. */
  revise(changes: TaskReviseChanges): Task {
    return Task.build({
      id: this.id,
      userId: this.userId,
      parentTaskId: changes.parentTaskId !== undefined ? (changes.parentTaskId ?? undefined) : this.parentTaskId,
      name: changes.name ?? this.name,
      description: changes.description ?? this.description,
      status: changes.status ?? this.status,
      priority: changes.priority ?? this.priority,
      notifyOffsetsMinutes: changes.notifyOffsetsMinutes ?? [...this.notifyOffsetsMinutes],
      tags: changes.tags ?? this.tags,
      startedAt: changes.startedAt !== undefined ? changes.startedAt : this.startedAt,
      estimatedFinishAt:
        changes.estimatedFinishAt !== undefined ? changes.estimatedFinishAt : this.estimatedFinishAt,
      finishedAt: changes.finishedAt !== undefined ? changes.finishedAt : this.finishedAt,
      dependsOnTaskIds: changes.dependsOnTaskIds ?? [...this.dependsOnTaskIds],
      noteLinks: changes.noteLinks ?? [...this.noteLinks],
      occurrence: detachOccurrence(this.occurrence),
      revision: this.revision + 1,
    });
  }

  /** Como `Event.withSeriesNotes`: a serie liga as notes, e a ocorrencia continua sendo dela. */
  withSeriesNotes(noteIds: readonly string[]): Task {
    const known = new Set(this.noteLinks.map((link) => link.noteId));
    const added = noteIds.filter((noteId) => !known.has(noteId)).map((noteId) => ({ noteId, fromRecurrence: true }));
    return Task.build({
      id: this.id,
      userId: this.userId,
      parentTaskId: this.parentTaskId,
      name: this.name,
      description: this.description,
      status: this.status,
      priority: this.priority,
      notifyOffsetsMinutes: [...this.notifyOffsetsMinutes],
      tags: this.tags,
      startedAt: this.startedAt,
      estimatedFinishAt: this.estimatedFinishAt,
      finishedAt: this.finishedAt,
      dependsOnTaskIds: [...this.dependsOnTaskIds],
      noteLinks: [...this.noteLinks, ...added],
      occurrence: this.occurrence,
      revision: this.revision,
    });
  }
}
