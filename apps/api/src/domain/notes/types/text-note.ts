import { NoteValidationError } from "../errors/note.errors";

/** O texto livre: o tipo que uma note assume quando ninguem diz outro. */
export interface TextNote {
  body: string;
}

export function parseTextNote(data: unknown, schemaVersion: number): TextNote {
  if (schemaVersion !== 1) {
    throw new NoteValidationError("Unsupported schema version");
  }
  if (typeof data !== "object" || data === null) {
    throw new NoteValidationError("Text note must be an object");
  }
  const { body } = data as { body?: unknown };
  if (typeof body !== "string" || body.trim().length === 0) {
    throw new NoteValidationError("Text note requires a body");
  }
  return { body };
}
