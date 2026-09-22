import { EventValidationError } from "../errors/event.errors";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type RoutineData = Record<string, never>;

export function parseRoutineData(data: unknown, schemaVersion: number): RoutineData {
  if (schemaVersion !== 1) {
    throw new EventValidationError("Unsupported schema version");
  }
  if (typeof data !== "object" || data === null) {
    throw new EventValidationError("Routine data must be an object");
  }
  if (Object.keys(data).length > 0) {
    throw new EventValidationError("Routine data does not accept fields");
  }
  return {};
}
