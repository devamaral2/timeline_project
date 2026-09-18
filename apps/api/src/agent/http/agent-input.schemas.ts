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
