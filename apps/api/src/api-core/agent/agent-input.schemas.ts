import { z } from "zod";

/** O que o usuario escreveu para o agente. */
export const agentTextSchema = z.string().trim().min(1).max(4000);

// O contexto entra no prompt: so identificadores simples, para nao virar canal
// de instrucao para o modelo.
export const agentScreenContextSchema = z.object({
  screen: z.string().regex(/^[a-z0-9_-]{1,64}$/),
  entityId: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,64}$/)
    .optional(),
});

/** O id de um pedido (ULID). */
export const requestIdSchema = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/);

/** Estavel por mensagem, escolhido pelo cliente: reenviar o mesmo id devolve o pedido ja aceito. */
export const clientMessageIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
