import { ArtifactValidationError } from "../errors/artifact.errors";

/** Tipos de artefato que apontam para um arquivo de skill ou agente do Hermes (ADR 0005). */
export const AGENT_FILE_ARTIFACT_TYPES = ["skill", "agent"] as const;
export type AgentFileArtifactType = (typeof AGENT_FILE_ARTIFACT_TYPES)[number];

/** Artefato `router`: o texto de um JEV da rota por passos, mantido pelo servidor a partir dos JSONs. Somente leitura. */
export function isRouterArtifactType(type: string): boolean {
  return type === "router";
}

export function isAgentFileArtifactType(type: string): type is AgentFileArtifactType {
  return (AGENT_FILE_ARTIFACT_TYPES as readonly string[]).includes(type);
}

/** A referencia ao arquivo: nunca o conteudo, que vive so na pasta compartilhada. */
export interface AgentFileData {
  /** Caminho relativo a pasta de arquivos, sempre com `/` (ex.: `hermes/skills/x/SKILL.md`). */
  path: string;
  /** SHA-256 do texto lido por ultimo. */
  hash: string;
  /** O arquivo sumiu da pasta; o ultimo texto continua guardado e pode ser restaurado. */
  missing: boolean;
  /** O `description` do cabecalho (frontmatter) do arquivo; sem ele, ausente. */
  description?: string;
}

export function parseAgentFileData(data: unknown, schemaVersion: number): AgentFileData {
  if (schemaVersion !== 1) throw new ArtifactValidationError("Unsupported schema version");
  if (typeof data !== "object" || data === null) {
    throw new ArtifactValidationError("Agent file artifact must be an object");
  }
  const { path, hash, missing, description } = data as { path?: unknown; hash?: unknown; missing?: unknown; description?: unknown };
  if (typeof path !== "string" || !path.startsWith("hermes/") || !path.endsWith(".md") || path.includes("..")) {
    throw new ArtifactValidationError("Agent file artifact requires a path inside hermes/ ending in .md");
  }
  if (typeof hash !== "string" || !/^[0-9a-f]{64}$/.test(hash)) {
    throw new ArtifactValidationError("Agent file artifact requires a sha-256 hash");
  }
  if (typeof missing !== "boolean") throw new ArtifactValidationError("Agent file artifact requires missing");
  if (description !== undefined && typeof description !== "string") throw new ArtifactValidationError("Agent file artifact description must be a string");
  return description ? { path, hash, missing, description } : { path, hash, missing };
}
