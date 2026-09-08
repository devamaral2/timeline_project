import { NoteId } from "../value-objects/note-id";
import { NoteValidationError } from "../errors/note.errors";

export interface NoteCreateProps {
  id?: string;
  userId: string;
  content: string;
  taskId?: string | null;
  eventId?: string | null;
  planId?: string | null;
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
  planId?: string | null;
}

interface NoteBuildProps {
  id: string;
  userId: string;
  content: string;
  taskId: string | undefined;
  eventId: string | undefined;
  planId: string | undefined;
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
  readonly planId: string | undefined;
  readonly revision: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: NoteBuildProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.content = props.content;
    this.taskId = props.taskId;
    this.eventId = props.eventId;
    this.planId = props.planId;
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

    return new Note(props);
  }

  static create(props: NoteCreateProps): Note {
    const now = new Date();
    return Note.build({
      id: props.id ?? NoteId.create().toString(),
      userId: props.userId,
      content: props.content,
      taskId: props.taskId ?? undefined,
      eventId: props.eventId ?? undefined,
      planId: props.planId ?? undefined,
      revision: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  static rehydrate(props: NoteRehydrateProps): Note {
    return Note.build({
      id: props.id ?? NoteId.create().toString(),
      userId: props.userId,
      content: props.content,
      taskId: props.taskId ?? undefined,
      eventId: props.eventId ?? undefined,
      planId: props.planId ?? undefined,
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
      planId: changes.planId !== undefined ? (changes.planId ?? undefined) : this.planId,
      revision: this.revision + 1,
      createdAt: this.createdAt,
      updatedAt: now,
    });
  }
}
