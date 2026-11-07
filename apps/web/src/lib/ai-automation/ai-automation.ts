import { ApiError, authedFetch } from "@/lib/api/authed-fetch";
import type { AgentChatErrorCode } from "@/lib/api/contracts";

/** Uma mensagem para o Hermes, acompanhada como job: `POST /api/ai/automation` e `GET /api/ai/jobs/:id`. */
export interface HermesTurnJobDto {
  id: string;
  kind: "hermes-turn";
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  errorCode?: AgentChatErrorCode;
  /** So na conclusao: o texto que o Hermes respondeu. */
  result?: { text: string };
}

export interface StartHermesTurnRequest {
  userId: string;
  text: string;
  conversationId?: string;
  /** Estavel por mensagem: reenviar nao manda uma segunda mensagem ao Hermes. */
  clientMessageId: string;
}

/**
 * O Hermes nunca e chamado pelo navegador: a API o chama. O servidor responde 404 enquanto a rota estiver
 * desligada (`AI_AUTOMATION`), e e assim que o chat descobre que ela nao existe neste ambiente.
 */
export const aiAutomation = {
  start: (request: StartHermesTurnRequest) =>
    authedFetch<HermesTurnJobDto>("/api/ai/automation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    }),
  get: (id: string) => authedFetch<HermesTurnJobDto>(`/api/ai/jobs/${encodeURIComponent(id)}`),
};

export type AiAutomationApi = Pick<typeof aiAutomation, "start" | "get">;

export function isAutomationRouteOff(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

export function isHermesTurnTerminal(job: Pick<HermesTurnJobDto, "status">): boolean {
  return job.status === "succeeded" || job.status === "failed" || job.status === "cancelled";
}

const HERMES_COMMAND = /^\/hermes\s+([\s\S]+)$/i;

/** `/hermes <mensagem>` no chat: devolve a mensagem, ou `null` quando o texto e um pedido comum. */
export function parseHermesCommand(text: string): string | null {
  const body = HERMES_COMMAND.exec(text.trim())?.[1]?.trim();
  return body ? body : null;
}
