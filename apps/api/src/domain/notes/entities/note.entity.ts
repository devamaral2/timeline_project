import { NoteId } from "../value-objects/note-id";
import { NoteValidationError } from "../errors/note.errors";
import { TagList } from "../../events/value-objects/tag-list";
import {
  DEFAULT_NOTE_TYPE,
  defaultNoteTypeRegistry,
  type NoteTypeRegistry,
} from "../types/note-type-registry";

export interface NoteCreateProps {
  id?: string;
  userId: string;
  name?: string;
  /** Ausente vira texto livre (`text`). */
  type?: string;
  schemaVersion?: number;
  data: unknown;
  tags?: string[];
}

export interface NoteRehydrateProps extends NoteCreateProps {
  name: string;
  type: string;
  schemaVersion: number;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface NoteReviseChanges {
  name?: string;
  type?: string;
  schemaVersion?: number;
  data?: unknown;
  tags?: string[];
}

interface NoteBuildProps {
  id: string;
  userId: string;
  name: string;
  type: string;
  schemaVersion: number;
  data: unknown;
  tags: string[];
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  for (const key of Object.getOwnPropertyNames(value)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  return Object.freeze(value);
}

/**
 * Uma note: `type` + `schemaVersion` dizem que forma o `data` tem. Ela nao tem
 * dono — eventos, tarefas e series e que apontam para ela, cada um com a sua
 * ordem (`NoteLink`) — e pode nao ser apontada por ninguem.
 */
export class Note {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly type: string;
  readonly schemaVersion: number;
  readonly data: unknown;
  readonly tags: string[];
  readonly revision: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private readonly registry: NoteTypeRegistry;

  private constructor(props: NoteBuildProps, registry: NoteTypeRegistry) {
    this.id = props.id;
    this.userId = props.userId;
    this.name = props.name;
    this.type = props.type;
    this.schemaVersion = props.schemaVersion;
    this.data = props.data;
    this.tags = props.tags;
    this.revision = props.revision;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
    this.registry = registry;
  }

  private static build(
    props: Omit<NoteBuildProps, "name"> & { name: string | undefined },
    registry: NoteTypeRegistry,
  ): Note {
    if (!Number.isInteger(props.revision) || props.revision < 1) {
      throw new NoteValidationError("Note revision must be an integer >= 1");
    }
    const { schemaVersion, data } = registry.parse(props.type, props.data, props.schemaVersion);
    const name = props.name ?? deriveNoteName(props.type, data);
    if (!name.trim()) throw new NoteValidationError("Note name cannot be empty");

    return new Note(
      {
        ...props,
        name,
        schemaVersion,
        data: deepFreeze(structuredClone(data)),
        tags: TagList.create(props.tags),
      },
      registry,
    );
  }

  static create(props: NoteCreateProps, registry: NoteTypeRegistry = defaultNoteTypeRegistry): Note {
    const now = new Date();
    return Note.build(
      {
        id: props.id ?? NoteId.create(),
        userId: props.userId,
        name: props.name,
        type: props.type ?? DEFAULT_NOTE_TYPE,
        schemaVersion: props.schemaVersion ?? 1,
        data: props.data,
        tags: props.tags ?? [],
        revision: 1,
        createdAt: now,
        updatedAt: now,
      },
      registry,
    );
  }

  static rehydrate(
    props: NoteRehydrateProps,
    registry: NoteTypeRegistry = defaultNoteTypeRegistry,
  ): Note {
    return Note.build(
      {
        id: props.id ?? NoteId.create(),
        userId: props.userId,
        name: props.name,
        type: props.type,
        schemaVersion: props.schemaVersion,
        data: props.data,
        tags: props.tags ?? [],
        revision: props.revision,
        createdAt: props.createdAt,
        updatedAt: props.updatedAt,
      },
      registry,
    );
  }

  /**
   * Trocar o `type` sem mandar `data` nao faz sentido: o dado antigo seria
   * validado contra uma forma que nao e a dele.
   */
  revise(changes: NoteReviseChanges): Note {
    const typeChanged = changes.type !== undefined && changes.type !== this.type;
    if (typeChanged && changes.data === undefined) {
      throw new NoteValidationError("Changing the note type requires new data");
    }
    return Note.build(
      {
        id: this.id,
        userId: this.userId,
        name: changes.name ?? this.name,
        type: changes.type ?? this.type,
        schemaVersion: changes.schemaVersion ?? (typeChanged ? 1 : this.schemaVersion),
        data: changes.data !== undefined ? changes.data : this.data,
        tags: changes.tags ?? this.tags,
        revision: this.revision + 1,
        createdAt: this.createdAt,
        updatedAt: new Date(),
      },
      this.registry,
    );
  }
}

/** O titulo que a note ganha quando ninguem deu um: o que o proprio tipo sugere. */
export function deriveNoteName(type: string, data: unknown): string {
  const record = (data ?? {}) as Record<string, unknown>;
  switch (type) {
    case "text":
      return firstLine(typeof record.body === "string" ? record.body : "") || "Nota";
    case "meal":
      return typeof record.name === "string" && record.name.trim() ? record.name : "Refeição";
    case "sleep":
      return "Sono";
    case "training":
      return "Treino";
    default:
      return "Nota";
  }
}

function firstLine(text: string): string {
  return text.split(/\r?\n/).map((line) => line.trim()).find(Boolean)?.slice(0, 100) ?? "";
}
