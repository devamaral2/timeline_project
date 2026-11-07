import { ApiError, authedFetch } from "@/lib/api/authed-fetch";
import type { AgentChatErrorCode } from "@/lib/api/contracts";

/** Um passo do Hermes: uma ferramenta que ele usou ou um pensamento (ADR 004). */
export interface HermesStepDto {
  id: string;
  kind: "thought" | "tool";
  label: string;
  /** O que o Hermes mostrou para a ferramenta (comando, caminho, busca) ou o texto do pensamento. */
  detail?: string;
  status: "running" | "done" | "failed";
  durationMs?: number;
}

/** Uma mensagem para o Hermes, acompanhada como job: `POST /api/ai/automation` e `GET /api/ai/jobs/:id`. */
export interface HermesTurnJobDto {
  id: string;
  kind: "hermes-turn";
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  errorCode?: AgentChatErrorCode;
  /** So na conclusao: o texto que o Hermes respondeu. */
  result?: { text: string };
  /** Os passos dados ate agora; crescem enquanto o job roda e ficam completos ao fim. */
  steps?: HermesStepDto[];
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

const HERMES_COMMAND = /^\/hermes(?:\s+([\s\S]+))?$/i;
const LEAVE_COMMAND = /^\/(?:app|assistente|sair)$/i;

/**
 * Comandos de modo do chat. `/hermes` entra no modo Hermes (com uma mensagem, ja a envia); `/app` volta ao
 * assistente da agenda. Qualquer outro texto nao e comando: devolve `null`.
 */
export type ChatModeCommand = { kind: "hermes"; text: string | null } | { kind: "leave" };

export function parseChatCommand(text: string): ChatModeCommand | null {
  const trimmed = text.trim();
  const hermes = HERMES_COMMAND.exec(trimmed);
  if (hermes) return { kind: "hermes", text: hermes[1]?.trim() || null };
  if (LEAVE_COMMAND.test(trimmed)) return { kind: "leave" };
  return null;
}
