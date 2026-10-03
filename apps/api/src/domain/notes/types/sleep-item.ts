import { NoteValidationError } from "../errors/note.errors";

export interface SleepItem {
  trackedSleepTime: number;
  score: number;
}

export function parseSleepItem(data: unknown, schemaVersion: number): SleepItem {
  if (schemaVersion !== 1) {
    throw new NoteValidationError("Unsupported schema version");
  }
  if (typeof data !== "object" || data === null) {
    throw new NoteValidationError("Sleep item must be an object");
  }

  const source = data as Record<string, unknown>;

  if (typeof source.trackedSleepTime !== "number" || !Number.isFinite(source.trackedSleepTime)) {
    throw new NoteValidationError("Sleep item requires a numeric trackedSleepTime");
  }
  if (typeof source.score !== "number" || !Number.isFinite(source.score)) {
    throw new NoteValidationError("Sleep item requires a numeric score");
  }

  return {
    trackedSleepTime: source.trackedSleepTime,
    score: source.score,
  };
}
