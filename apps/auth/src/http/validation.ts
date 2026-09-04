import { BadRequestException } from "@nestjs/common";
import type { z } from "zod";

/**
 * A unica porta de entrada de corpo e query nos controllers.
 *
 * `schema.parse` lancaria `ZodError`, que o filtro nao conhece e viraria 500 --
 * e um shape invalido e 400, nao falha do servidor. Alem disso, a mensagem do
 * `ZodError` carrega o valor recebido: serializa-la devolveria ao cliente
 * pedacos do proprio corpo, senha inclusive. Aqui a mensagem morre e o corpo
 * externo e sempre `{"code":"invalid_request"}`.
 */
export function parseRequest<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new BadRequestException("invalid request");
  return result.data;
}
