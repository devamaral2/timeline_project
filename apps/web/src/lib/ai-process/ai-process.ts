import { ApiError, authedFetch } from "@/lib/api/authed-fetch";
import type { AiProcessDto, StartAiProcessEditRequest, StartAiProcessRequest } from "@/lib/api/contracts";

/**
 * A rota de IA por processo. O servidor a responde 404 enquanto estiver desligada (`AI_PROCESS`), e e assim que
 * o chat descobre qual caminho usar: sem configuracao no cliente e sem efeito colateral no servidor.
 */
export const aiProcess = {
  start: (request: StartAiProcessRequest) =>
    authedFetch<{ processId: string }>("/api/ai/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    }),
  /** Edicao pela tela de detalhe (ADR 006): o servidor escolhe o agente pelo tipo da entidade. */
  startEdit: (request: StartAiProcessEditRequest) =>
    authedFetch<{ processId: string }>("/api/ai/process/edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    }),
  get: (id: string) => authedFetch<AiProcessDto>(`/api/ai/process/${encodeURIComponent(id)}`),
};

export type AiProcessApi = Pick<typeof aiProcess, "start" | "get">;

/** O que a barra de edicao por IA usa: iniciar a edicao e acompanhar o processo. */
export type AiProcessEditApi = Pick<typeof aiProcess, "startEdit" | "get">;

/** A rota por processo esta desligada no servidor: o chat segue pelo caminho de sempre. */
export function isProcessRouteOff(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

export function isProcessTerminal(process: Pick<AiProcessDto, "status">): boolean {
  return process.status === "completed" || process.status === "failed";
}
