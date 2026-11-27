import { ARTIFACT_TYPES, GLOBAL_ARTIFACT_TYPES, type ArtifactType } from "../../sets";
import { ArtifactValidationError } from "../errors/artifact.errors";
import { parseAgentFileData } from "./agent-file-data";
import { parseFoodData } from "./food-data";
import { parseSleepData } from "./sleep-data";
import { parseTextData } from "./text-data";
import { parseTrainingData } from "./training-data";
import { parseWorkoutData } from "./workout-data";

export interface ArtifactTypeDefinition<TData> {
  type: ArtifactType;
  currentSchemaVersion: number;
  parse(data: unknown, schemaVersion: number): TData;
}

export interface ParsedArtifactData {
  schemaVersion: number;
  data: unknown;
}

/** Tipo de um artefato criado sem dizer qual: texto livre. */
export const DEFAULT_ARTIFACT_TYPE: ArtifactType = "text";

export function isArtifactType(value: unknown): value is ArtifactType {
  return ARTIFACT_TYPES.includes(value as ArtifactType);
}

/** So alimento e exercicio podem nao ter dono. */
export function isGlobalArtifactType(type: string): boolean {
  return (GLOBAL_ARTIFACT_TYPES as readonly string[]).includes(type);
}

/**
 * A forma do `data` de cada tipo de artefato. O banco so garante que `data` e
 * um objeto; quem diz qual objeto e valido para cada `type` e `schema_version`
 * e este registro.
 */
export class ArtifactTypeRegistry {
  private readonly definitions: Map<string, ArtifactTypeDefinition<unknown>>;

  constructor(definitions: readonly ArtifactTypeDefinition<unknown>[]) {
    this.definitions = new Map(definitions.map((definition) => [definition.type, definition]));
  }

  getDefinition(type: string): ArtifactTypeDefinition<unknown> | undefined {
    return this.definitions.get(type);
  }

  parse(type: string, data: unknown, schemaVersion: number): ParsedArtifactData {
    const definition = this.definitions.get(type);
    if (!definition) {
      throw new ArtifactValidationError(`Unknown artifact type: ${type}`);
    }
    const parsed = definition.parse(data, schemaVersion);
    return { schemaVersion: definition.currentSchemaVersion, data: parsed };
  }
}

export const defaultArtifactTypeRegistry = new ArtifactTypeRegistry([
  { type: "text", currentSchemaVersion: 1, parse: parseTextData },
  // Notícias, resumo de e-mail e transcrição guardam o mesmo dado da nota.
  { type: "news", currentSchemaVersion: 1, parse: parseTextData },
  { type: "email_summary", currentSchemaVersion: 1, parse: parseTextData },
  { type: "youtube_transcript", currentSchemaVersion: 1, parse: parseTextData },
  { type: "food", currentSchemaVersion: 1, parse: parseFoodData },
  { type: "sleep", currentSchemaVersion: 1, parse: parseSleepData },
  { type: "training", currentSchemaVersion: 1, parse: parseTrainingData },
  { type: "workout", currentSchemaVersion: 1, parse: parseWorkoutData },
  { type: "router", currentSchemaVersion: 1, parse: parseTextData },
  { type: "skill", currentSchemaVersion: 1, parse: parseAgentFileData },
  { type: "agent", currentSchemaVersion: 1, parse: parseAgentFileData },
]);
