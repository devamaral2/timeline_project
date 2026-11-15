import type { RequestDto } from "@repo/contracts";
import { ApiRequestError, apiRequest } from "./client-request";
import { HermesOffError } from "./requests";

/**
 * Arquivos do agente (skills e agentes do Hermes, ADR 0005). Só o dono acessa: para quem não é, cada função
 * falha com `ApiRequestError` de tipo `forbidden`. Os formatos não estão no pacote de contratos; os tipos abaixo
 * seguem a forma que a API devolve.
 */

export type AgentFileKind = "skill" | "agent";

/** Rota que cada função desta área chama, no formato do catálogo da API. `route-coverage.test.ts` confere. */
export const agentFilesRoutes = {
  listAgentFiles: "GET /api/ai/config",
  readAgentFileText: "GET /api/ai/config/file",
  listAgentFileBackups: "GET /api/ai/config/backups",
  restoreAgentFileBackup: "POST /api/ai/config/restore",
  requestAgentFileEdit: "POST /api/ai/config/edit-request",
} as const;

/** Um arquivo da pasta, sem o texto. `missing` = saiu da pasta; o último texto continua legível e restaurável. */
export interface AgentFileEntry {
  path: string;
  kind: AgentFileKind;
  hash: string;
  missing: boolean;
  tags: string[];
  description: string;
}

/** Um backup de um arquivo, sem o texto. `createdAt` é ISO; a lista vem do mais novo para o mais antigo. */
export interface AgentFileBackup {
  id: string;
  path: string;
  createdAt: string;
  sizeBytes: number;
}

export interface AgentFileEditInput {
  path: string;
  request: string;
  /** Estável por pedido: reenviar o mesmo valor devolve o pedido já aceito. */
  clientMessageId: string;
}

/** Os arquivos da pasta, sem o texto, ordenados por caminho. */
export async function listAgentFiles(): Promise<AgentFileEntry[]> {
  const body = await apiRequest<{ files: AgentFileEntry[] }>("GET", "/api/ai/config");
  return body.files;
}

/** O texto atual do arquivo (ou o último conhecido, se ele sumiu da pasta). */
export async function readAgentFileText(path: string): Promise<string> {
  const body = await apiRequest<{ path: string; text: string }>("GET", "/api/ai/config/file", { query: { path } });
  return body.text;
}

/** Os backups de um arquivo, sem o texto, do mais novo para o mais antigo. */
export async function listAgentFileBackups(path: string): Promise<AgentFileBackup[]> {
  const body = await apiRequest<{ backups: AgentFileBackup[] }>("GET", "/api/ai/config/backups", { query: { path } });
  return body.backups;
}

/**
 * Restaura um backup no arquivo. O texto substituído vira um backup novo, então a restauração se desfaz.
 * Devolve a listagem atualizada.
 */
export async function restoreAgentFileBackup(path: string, backupId: string): Promise<AgentFileEntry[]> {
  const body = await apiRequest<{ files: AgentFileEntry[] }>("POST", "/api/ai/config/restore", { body: { path, backupId } });
  return body.files;
}

/**
 * Pede ao Hermes uma edição no arquivo. Devolve o pedido inteiro: acompanhe com `getRequest`. Com o Hermes
 * desligado, a API responde 404 e isso vira `HermesOffError`.
 */
export async function requestAgentFileEdit(input: AgentFileEditInput): Promise<RequestDto> {
  try {
    return await apiRequest<RequestDto>("POST", "/api/ai/config/edit-request", { body: input });
  } catch (error) {
    if (error instanceof ApiRequestError && error.kind === "not_found") throw new HermesOffError();
    throw error;
  }
}
