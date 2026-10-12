import { DEFAULT_EVENT_PRIORITY, type EventPriority } from "../types/event-priority";
import { DEFAULT_EVENT_MISSED } from "../types/missed-flag";
import { defaultEventDurationMinutesFor } from "../types/default-event-duration";
import {
  DEFAULT_EVENT_NOTIFICATION_OFFSETS_MINUTES,
  type NotificationOffsetMinutes,
} from "../../notifications/types/notification-offset-minutes";
import type { Interruption } from "../value-objects/interruption";
import { TagList } from "../value-objects/tag-list";
import { EventId } from "../value-objects/event-id";
import { EventValidationError } from "../errors/event.errors";
import { DEFAULT_EVENT_KIND, type EventKind } from "../types/event-kind";
import { normalizeNoteLinks, type NoteLink } from "../../notes/types/note-link";
import { detachOccurrence, type OccurrenceLink } from "../../recurrences/types/occurrence-link";

export interface EventCreateProps {
  id?: string;
  userId: string;
  name: string;
  description: string;
  startedAt: Date;
  finishedAt?: Date;
  tags: string[];
  interruptions: Interruption[];
  kind?: EventKind;
  /** As notes do evento, na ordem em que aparecem. */
  noteLinks?: NoteLink[];
  missed?: boolean;
  priority?: EventPriority;
  notifyOffsetsMinutes?: NotificationOffsetMinutes[];
  taskIds?: string[];
  occurrence?: OccurrenceLink;
}

export interface EventRehydrateProps extends EventCreateProps {
  revision: number;
}

export interface EventReviseChanges {
  name?: string;
  description?: string;
  startedAt?: Date;
  finishedAt?: Date;
  tags?: string[];
  interruptions?: Interruption[];
  kind?: EventKind;
  noteLinks?: NoteLink[];
  missed?: boolean;
  priority?: EventPriority;
  notifyOffsetsMinutes?: NotificationOffsetMinutes[];
  taskIds?: string[];
}

interface EventBuildProps {
  id: string;
  userId: string;
  name: string;
  description: string;
  startedAt: Date;
  finishedAt: Date | undefined;
  tags: string[];
  interruptions: Interruption[];
  kind: EventKind;
  noteLinks: NoteLink[];
  missed: boolean;
  priority: EventPriority;
  notifyOffsetsMinutes: NotificationOffsetMinutes[];
  taskIds: string[];
  occurrence: OccurrenceLink | undefined;
  revision: number;
}

export class Event {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly description: string;
  readonly startedAt: Date;
  readonly finishedAt: Date | undefined;
  readonly tags: string[];
  readonly interruptions: Interruption[];
  readonly kind: EventKind;
  readonly noteLinks: readonly NoteLink[];
  readonly missed: boolean;
  readonly priority: EventPriority;
  readonly notifyOffsetsMinutes: readonly NotificationOffsetMinutes[];
  readonly taskIds: readonly string[];
  /** Presente quando o evento e uma ocorrencia de uma serie. */
  readonly occurrence: OccurrenceLink | undefined;
  readonly revision: number;

  private constructor(props: EventBuildProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.name = props.name;
    this.description = props.description;
    this.startedAt = props.startedAt;
    this.finishedAt = props.finishedAt;
    this.tags = props.tags;
    this.interruptions = props.interruptions;
    this.kind = props.kind;
    this.noteLinks = props.noteLinks;
    this.missed = props.missed;
    this.priority = props.priority;
    this.notifyOffsetsMinutes = props.notifyOffsetsMinutes;
    this.taskIds = props.taskIds;
    this.occurrence = props.occurrence;
    this.revision = props.revision;
  }

  /**
   * Evento novo nunca fica sem fim: sem `finishedAt` declarado, estimamos pela
   * duracao tipica da natureza do evento.
   */
  private static estimateFinishedAt(startedAt: Date, kind: EventKind): Date {
    return new Date(startedAt.getTime() + defaultEventDurationMinutesFor(kind) * 60_000);
  }

  private static build(props: EventBuildProps): Event {
    if (props.finishedAt && props.finishedAt < props.startedAt) {
      throw new EventValidationError("finishedAt must be equal to or after startedAt");
    }
    if (!Number.isInteger(props.revision) || props.revision < 1) {
      throw new EventValidationError("Event revision must be an integer >= 1");
    }

    return new Event({
      ...props,
      tags: TagList.create(props.tags),
      noteLinks: normalizeNoteLinks(props.noteLinks),
      taskIds: Array.from(new Set(props.taskIds)),
    });
  }

  static create(props: EventCreateProps): Event {
    const kind = props.kind ?? DEFAULT_EVENT_KIND;
    const finishedAt = props.finishedAt ?? Event.estimateFinishedAt(props.startedAt, kind);
    return Event.build({
      id: props.id ?? EventId.create(),
      userId: props.userId,
      name: props.name,
      description: props.description,
      startedAt: props.startedAt,
      finishedAt,
      tags: props.tags,
      interruptions: props.interruptions,
      kind,
      noteLinks: props.noteLinks ?? [],
      missed: props.missed ?? DEFAULT_EVENT_MISSED,
      priority: props.priority ?? DEFAULT_EVENT_PRIORITY,
      notifyOffsetsMinutes: props.notifyOffsetsMinutes ?? DEFAULT_EVENT_NOTIFICATION_OFFSETS_MINUTES,
      taskIds: props.taskIds ?? [],
      occurrence: props.occurrence,
      revision: 1,
    });
  }

  static rehydrate(props: EventRehydrateProps): Event {
    return Event.build({
      id: props.id ?? EventId.create(),
      userId: props.userId,
      name: props.name,
      description: props.description,
      startedAt: props.startedAt,
      finishedAt: props.finishedAt,
      tags: props.tags,
      interruptions: props.interruptions,
      kind: props.kind ?? DEFAULT_EVENT_KIND,
      noteLinks: props.noteLinks ?? [],
      missed: props.missed ?? DEFAULT_EVENT_MISSED,
      priority: props.priority ?? DEFAULT_EVENT_PRIORITY,
      // Nao reaplica o default de evento novo: uma linha existente sem o
      // campo nunca teve esse aviso, e inventar um seria o mesmo erro que
      // a marca de nao realizado evita para documentos antigos.
      notifyOffsetsMinutes: props.notifyOffsetsMinutes ?? [],
      taskIds: props.taskIds ?? [],
      occurrence: props.occurrence,
      revision: props.revision,
    });
  }

  /** Toda revisao e uma edicao do usuario, e por isso destaca a ocorrencia da serie. */
  revise(changes: EventReviseChanges): Event {
    return Event.build({
      id: this.id,
      userId: this.userId,
      name: changes.name ?? this.name,
      description: changes.description ?? this.description,
      startedAt: changes.startedAt ?? this.startedAt,
      finishedAt: changes.finishedAt !== undefined ? changes.finishedAt : this.finishedAt,
      tags: changes.tags ?? this.tags,
      interruptions: changes.interruptions ?? this.interruptions,
      kind: changes.kind ?? this.kind,
      noteLinks: changes.noteLinks ?? [...this.noteLinks],
      missed: changes.missed ?? this.missed,
      priority: changes.priority ?? this.priority,
      notifyOffsetsMinutes: changes.notifyOffsetsMinutes ?? [...this.notifyOffsetsMinutes],
      taskIds: changes.taskIds ?? [...this.taskIds],
      occurrence: detachOccurrence(this.occurrence),
      revision: this.revision + 1,
    });
  }

  /**
   * Notes que a serie liga a ocorrencia. Nao e uma edicao do usuario: ao
   * contrario de `revise`, a ocorrencia continua sendo "da serie" e a revisao
   * nao muda.
   */
  withSeriesNotes(noteIds: readonly string[]): Event {
    const known = new Set(this.noteLinks.map((link) => link.noteId));
    const added = noteIds.filter((noteId) => !known.has(noteId)).map((noteId) => ({ noteId, fromRecurrence: true }));
    return Event.build({
      id: this.id,
      userId: this.userId,
      name: this.name,
      description: this.description,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
      tags: this.tags,
      interruptions: this.interruptions,
      kind: this.kind,
      noteLinks: [...this.noteLinks, ...added],
      missed: this.missed,
      priority: this.priority,
      notifyOffsetsMinutes: [...this.notifyOffsetsMinutes],
      taskIds: [...this.taskIds],
      occurrence: this.occurrence,
      revision: this.revision,
    });
  }

  getDurationMinutes(): number | null {
    if (!this.finishedAt) return null;
    return Math.round((this.finishedAt.getTime() - this.startedAt.getTime()) / 60000);
  }
}
