import { ArtifactValidationError } from "../errors/artifact.errors";

export interface SleepData {
  trackedSleepTime: number;
  score: number;
}

export function parseSleepData(data: unknown, schemaVersion: number): SleepData {
  if (schemaVersion !== 1) {
    throw new ArtifactValidationError("Unsupported schema version");
  }
  if (typeof data !== "object" || data === null) {
    throw new ArtifactValidationError("Sleep data must be an object");
  }

  const source = data as Record<string, unknown>;

  if (typeof source.trackedSleepTime !== "number" || !Number.isFinite(source.trackedSleepTime)) {
    throw new ArtifactValidationError("Sleep data requires a numeric trackedSleepTime");
  }
  if (typeof source.score !== "number" || !Number.isFinite(source.score)) {
    throw new ArtifactValidationError("Sleep data requires a numeric score");
  }

  return {
    trackedSleepTime: source.trackedSleepTime,
    score: source.score,
  };
}
