import { authedFetch } from "@/lib/api/authed-fetch";
import type { AiProcessDto, StartAiProcessEditRequest } from "@/lib/api/contracts";

/**
 * A rota de IA por processo que ainda sobra: a edição pela barra "Editar com IA" (ticket 43 a troca). O chat
 * de pedidos saiu para `@/lib/api/requests`.
 */
export const aiProcess = {
  /** Edicao pela tela de detalhe (ADR 006): o servidor escolhe o agente pelo tipo da entidade. */
  startEdit: (request: StartAiProcessEditRequest) =>
    authedFetch<{ processId: string }>("/api/ai/process/edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    }),
  get: (id: string) => authedFetch<AiProcessDto>(`/api/ai/process/${encodeURIComponent(id)}`),
};

/** O que a barra de edicao por IA usa: iniciar a edicao e acompanhar o processo. */
export type AiProcessEditApi = Pick<typeof aiProcess, "startEdit" | "get">;

export function isProcessTerminal(process: Pick<AiProcessDto, "status">): boolean {
  return process.status === "completed" || process.status === "failed";
}
