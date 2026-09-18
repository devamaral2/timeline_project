import { z } from "zod";
import { AgentConversationNotFoundError, EntityBatchConflictError } from "@repo/entities";
import type { AgentChatClientFrame, AgentChatErrorCode } from "@repo/entities/contracts";
import {
  AgentLimitReachedError,
  AgentRunCancelledError,
  AgentTargetForbiddenError,
  InvalidInputError,
  LlmUnavailableError,
} from "../errors/agent.errors";
import { agentScreenContextSchema, agentTextSchema } from "../http/agent-input.schemas";

export const AGENT_CHAT_PATH = "/api/ai/chat";

export const CHAT_CLOSE = {
  /** Servidor encerrando (deploy, restart). */
  goingAway: 1001,
  /** Nao deu para conferir o ticket — o banco falhou, nao o cliente. */
  internalError: 1011,
  unauthorized: 4401,
  reauthenticate: 4001,
  idle: 4002,
} as const;

/**
 * O ator fica congelado no ticket. A vida maxima da conexao e o TTL do access
 * token: depois disso o cliente pede outro ticket, e uma sessao revogada para
 * de conversar.
 */
export const CHAT_CONNECTION_LIFETIME_MS = 15 * 60_000;
export const CHAT_IDLE_TIMEOUT_MS = 5 * 60_000;
/** Abaixo dos 30 s de `proxyTimeout` do rewrite do Next. */
export const CHAT_HEARTBEAT_MS = 25_000;
export const CHAT_MAX_PAYLOAD_BYTES = 64 * 1024;

/** `randomBytes(32).toString("base64url")`: nada diferente disso chega ao banco. */
export const CHAT_TICKET_FORMAT = /^[A-Za-z0-9_-]{43}$/;

const frameIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

/** ULID em Crockford base32, como o dominio o gera. */
export const CONVERSATION_ID_FORMAT = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/**
 * Nenhum dos objetos e `strict`: o Zod descarta chave desconhecida em vez de
 * recusar o frame. E de proposito — uma aba aberta durante o deploy continua
 * mandando o antigo `history`, que aqui e simplesmente ignorado em vez de
 * virar `invalid_frame`.
 */
const clientFrameSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("message"),
    id: frameIdSchema,
    text: agentTextSchema,
    context: agentScreenContextSchema.optional(),
    conversationId: z.string().regex(CONVERSATION_ID_FORMAT).optional(),
  }),
  z.object({ type: z.literal("cancel"), id: frameIdSchema }),
]);

export type ParsedClientFrame =
  | { ok: true; frame: AgentChatClientFrame }
  | { ok: false; id?: string };

/** O `id` volta mesmo num frame recusado, quando da para le-lo: o cliente sabe qual mensagem falhou. */
export function parseClientFrame(raw: string): ParsedClientFrame {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false };
  }

  const parsed = clientFrameSchema.safeParse(data);
  if (parsed.success) return { ok: true, frame: parsed.data };

  const id = frameIdSchema.safeParse((data as { id?: unknown } | null)?.id);
  return id.success ? { ok: false, id: id.data } : { ok: false };
}

/** As mesmas classes que o `DomainExceptionFilter` traduz para HTTP, em codigos do chat. */
export function chatErrorCodeOf(error: unknown): AgentChatErrorCode {
  if (error instanceof AgentRunCancelledError) return "cancelled";
  if (error instanceof InvalidInputError) return "invalid_input";
  if (error instanceof AgentTargetForbiddenError) return "forbidden";
  if (error instanceof AgentLimitReachedError) return "limit_reached";
  if (error instanceof AgentConversationNotFoundError) return "conversation_gone";
  if (error instanceof EntityBatchConflictError) return "conflict";
  if (error instanceof LlmUnavailableError) return "unavailable";
  return "internal";
}
