import { NoteValidationError } from "../errors/note.errors";

/** Tipos de nota que apontam para um arquivo de skill ou agente do Hermes (ADR 0005). */
export const AGENT_FILE_NOTE_TYPES = ["skill", "agent"] as const;
export type AgentFileNoteType = (typeof AGENT_FILE_NOTE_TYPES)[number];

/** Nota `router`: o texto de um JEV da rota por processo, mantido pelo servidor a partir dos JSONs. Somente leitura. */
export function isRouterNoteType(type: string): boolean {
  return type === "router";
}

export function isAgentFileNoteType(type: string): type is AgentFileNoteType {
  return (AGENT_FILE_NOTE_TYPES as readonly string[]).includes(type);
}

/** A referencia ao arquivo: nunca o conteudo, que vive so na pasta compartilhada. */
export interface AgentFileNote {
  /** Caminho relativo a pasta de arquivos, sempre com `/` (ex.: `hermes/skills/x/SKILL.md`). */
  path: string;
  /** SHA-256 do texto lido por ultimo. */
  hash: string;
  /** O arquivo sumiu da pasta; o ultimo texto continua guardado e pode ser restaurado. */
  missing: boolean;
  /** O `description` do cabecalho (frontmatter) do arquivo; sem ele, ausente. */
  description?: string;
}

export function parseAgentFileNote(data: unknown, schemaVersion: number): AgentFileNote {
  if (schemaVersion !== 1) throw new NoteValidationError("Unsupported schema version");
  if (typeof data !== "object" || data === null) {
    throw new NoteValidationError("Agent file note must be an object");
  }
  const { path, hash, missing, description } = data as { path?: unknown; hash?: unknown; missing?: unknown; description?: unknown };
  if (typeof path !== "string" || !path.startsWith("hermes/") || !path.endsWith(".md") || path.includes("..")) {
    throw new NoteValidationError("Agent file note requires a path inside hermes/ ending in .md");
  }
  if (typeof hash !== "string" || !/^[0-9a-f]{64}$/.test(hash)) {
    throw new NoteValidationError("Agent file note requires a sha-256 hash");
  }
  if (typeof missing !== "boolean") throw new NoteValidationError("Agent file note requires missing");
  if (description !== undefined && typeof description !== "string") throw new NoteValidationError("Agent file note description must be a string");
  return description ? { path, hash, missing, description } : { path, hash, missing };
}
