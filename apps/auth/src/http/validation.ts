import type { z } from "zod";

/**
 * Erro de forma do corpo, com o status que o transporte traduz para
 * `400 invalid_request`. Não carrega mensagem utilizável: o `ZodError` original
 * traz o valor recebido — inclusive senha — e nunca pode sair na resposta.
 */
export class RequestValidationError extends Error {
  readonly statusCode = 400;
  constructor() {
    super("invalid request");
  }
}

/**
 * A única porta de entrada de corpo e query nas rotas.
 *
 * `schema.parse` lançaria `ZodError`, que não é um erro conhecido do
 * transporte e viraria 500 — e um shape inválido é 400, não falha do servidor.
 * A mensagem morre aqui e o corpo externo é sempre `{"code":"invalid_request"}`.
 */
export function parseRequest<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new RequestValidationError();
  return result.data;
}
