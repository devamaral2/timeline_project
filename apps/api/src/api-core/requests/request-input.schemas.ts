import { modelSelectionSchema } from "@repo/contracts/schemas";
import { z } from "zod";
import {
  agentScreenContextSchema,
  agentTextSchema,
  clientMessageIdSchema,
  projectIdSchema,
  requestIdSchema,
} from "../agent/agent-input.schemas";
import { MAX_REQUEST_LIST_LIMIT } from "./request-operations";
import { MAX_TRANSCRIPT_LENGTH } from "./voice-task-worker";

/** `POST /api/requests`: o pedido em texto que o agente desdobra em passos. */
export const startRequestBody = z.object({
  userId: z.string().min(1).max(128),
  text: agentTextSchema,
  context: agentScreenContextSchema.optional(),
  sessionId: requestIdSchema.optional(),
  clientMessageId: clientMessageIdSchema.optional(),
  /** O provedor, o modelo e o esforco que o campo do chat mostra: os agentes do pedido rodam com ele. */
  model: modelSelectionSchema.optional(),
  /** O projeto do pedido; vale sobre a sessao. Sem ele, o pedido fica no projeto do primeiro da sessao ou em `diario`. */
  projectId: projectIdSchema.optional(),
});

/** `POST /api/requests/edit`: o pedido de edicao da entidade aberta na tela de detalhe (ADR 006). */
export const startEditRequestBody = z.object({
  userId: z.string().min(1).max(128),
  text: agentTextSchema,
  entityType: z.enum([
    "task", "artifact", "food_artifact", "sleep_artifact", "training_artifact", "skill_artifact", "agent_artifact",
  ]),
  entityId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  /** O provedor, o modelo e o esforco que o campo do detalhe mostra: o agente de edicao roda com ele. */
  model: modelSelectionSchema.optional(),
});

/** `POST /api/requests/hermes`: a mensagem do chat com o Hermes (ADR 004). */
export const startHermesRequestBody = z.object({
  userId: z.string().min(1).max(128),
  text: agentTextSchema,
  /** O primeiro pedido da sessao: o Hermes continua o mesmo assunto e a mesma memoria. */
  sessionId: requestIdSchema.optional(),
  /** Estavel por mensagem: reenviar o mesmo id devolve o pedido ja aceito, sem uma segunda mensagem ao Hermes. */
  clientMessageId: clientMessageIdSchema,
  /** O projeto do pedido; vale sobre a sessao. Sem ele, o pedido fica no projeto do primeiro da sessao ou em `diario`. */
  projectId: projectIdSchema.optional(),
});

/** `POST /api/requests/model`: o corpo do Hermes mais a escolha do provedor, do modelo e do esforco (ADR 0019). */
export const startModelRequestBody = startHermesRequestBody.extend({ model: modelSelectionSchema });

/** `POST /api/requests/voice`: a fala que vira um pedido e, depois, a tarefa. */
export const startVoiceRequestBody = z.object({
  transcript: z.string().trim().min(1).max(MAX_TRANSCRIPT_LENGTH),
  clientMessageId: clientMessageIdSchema.optional(),
});

/** O `limit` de `GET /api/requests`, parseado da query como no Express. */
export const listRequestsLimitQuery = z.coerce.number().int().min(1).max(MAX_REQUEST_LIST_LIMIT).optional();
