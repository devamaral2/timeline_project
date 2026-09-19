import { NoteId } from "../value-objects/note-id";
import { NoteValidationError } from "../errors/note.errors";
import { TagList } from "../../events/value-objects/tag-list";

export interface NoteCreateProps {
  id?: string;
  userId: string;
  content: string;
  taskId?: string | null;
  eventId?: string | null;
  tags?: string[];
}

export interface NoteRehydrateProps extends NoteCreateProps {
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface NoteReviseChanges {
  content?: string;
  taskId?: string | null;
  eventId?: string | null;
  tags?: string[];
}

interface NoteBuildProps {
  id: string;
  userId: string;
  content: string;
  taskId: string | undefined;
  eventId: string | undefined;
  tags: string[];
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}

export class Note {
  readonly id: string;
  readonly userId: string;
  readonly content: string;
  readonly taskId: string | undefined;
  readonly eventId: string | undefined;
  readonly tags: string[];
  readonly revision: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: NoteBuildProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.content = props.content;
    this.taskId = props.taskId;
    this.eventId = props.eventId;
    this.tags = props.tags;
    this.revision = props.revision;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  private static build(props: NoteBuildProps): Note {
    if (!props.content || props.content.trim().length === 0) {
      throw new NoteValidationError("Note content cannot be empty");
    }
    if (!Number.isInteger(props.revision) || props.revision < 1) {
      throw new NoteValidationError("Note revision must be an integer >= 1");
    }

    return new Note({ ...props, tags: TagList.create(props.tags) });
  }

  static create(props: NoteCreateProps): Note {
    const now = new Date();
    return Note.build({
      id: props.id ?? NoteId.create(),
      userId: props.userId,
      content: props.content,
      taskId: props.taskId ?? undefined,
      eventId: props.eventId ?? undefined,
      tags: props.tags ?? [],
      revision: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  static rehydrate(props: NoteRehydrateProps): Note {
    return Note.build({
      id: props.id ?? NoteId.create(),
      userId: props.userId,
      content: props.content,
      taskId: props.taskId ?? undefined,
      eventId: props.eventId ?? undefined,
      tags: props.tags ?? [],
      revision: props.revision,
      createdAt: props.createdAt,
      updatedAt: props.updatedAt,
    });
  }

  revise(changes: NoteReviseChanges): Note {
    const now = new Date();
    return Note.build({
      id: this.id,
      userId: this.userId,
      content: changes.content ?? this.content,
      taskId: changes.taskId !== undefined ? (changes.taskId ?? undefined) : this.taskId,
      eventId: changes.eventId !== undefined ? (changes.eventId ?? undefined) : this.eventId,
      tags: changes.tags ?? this.tags,
      revision: this.revision + 1,
      createdAt: this.createdAt,
      updatedAt: now,
    });
  }
}
