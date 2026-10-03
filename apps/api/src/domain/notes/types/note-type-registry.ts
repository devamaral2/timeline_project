import { NoteValidationError } from "../errors/note.errors";
import type { NoteTypeDefinition } from "./note-type-definition";
import { parseMealItem } from "./meal-item";
import { parseSleepItem } from "./sleep-item";
import { parseTextNote } from "./text-note";
import { parseTrainingData } from "./training-data";

export interface ParsedNoteData {
  schemaVersion: number;
  data: unknown;
}

/** Tipo de uma note criada sem dizer qual: texto livre. */
export const DEFAULT_NOTE_TYPE = "text";

/**
 * A forma do `data` de cada tipo de note. O banco so garante que `data` e um
 * objeto; quem diz qual objeto e valido para cada `type` e `schema_version` e
 * este registro.
 */
export class NoteTypeRegistry {
  private readonly definitions: Map<string, NoteTypeDefinition<unknown>>;

  constructor(definitions: readonly NoteTypeDefinition<unknown>[]) {
    this.definitions = new Map(definitions.map((definition) => [definition.type, definition]));
  }

  getDefinition(type: string): NoteTypeDefinition<unknown> | undefined {
    return this.definitions.get(type);
  }

  parse(type: string, data: unknown, schemaVersion: number): ParsedNoteData {
    const definition = this.definitions.get(type);
    if (!definition) {
      throw new NoteValidationError(`Unknown note type: ${type}`);
    }
    const parsed = definition.parse(data, schemaVersion);
    return { schemaVersion: definition.currentSchemaVersion, data: parsed };
  }
}

export const defaultNoteTypeRegistry = new NoteTypeRegistry([
  { type: "text", currentSchemaVersion: 1, parse: parseTextNote },
  { type: "meal", currentSchemaVersion: 1, parse: parseMealItem },
  { type: "sleep", currentSchemaVersion: 1, parse: parseSleepItem },
  { type: "training", currentSchemaVersion: 1, parse: parseTrainingData },
]);
