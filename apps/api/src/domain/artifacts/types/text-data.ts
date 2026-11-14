import { ArtifactValidationError } from "../errors/artifact.errors";

/** O texto livre: o tipo que um artefato assume quando ninguem diz outro. */
export interface TextData {
  /** Markdown (GFM), guardado como foi escrito; texto puro e markdown valido. */
  body: string;
}

export function parseTextData(data: unknown, schemaVersion: number): TextData {
  if (schemaVersion !== 1) {
    throw new ArtifactValidationError("Unsupported schema version");
  }
  if (typeof data !== "object" || data === null) {
    throw new ArtifactValidationError("Text artifact must be an object");
  }
  const { body } = data as { body?: unknown };
  if (typeof body !== "string" || body.trim().length === 0) {
    throw new ArtifactValidationError("Text artifact requires a body");
  }
  return { body };
}
