import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

/** Uma operação HTTP do Auth declarada sem decorators. */
export interface AuthRoute {
  readonly method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
  readonly path: string;
  /** Status de sucesso declarado; quando omitido, o Fastify responde 200. */
  readonly status?: number;
  readonly handler: (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => unknown | Promise<unknown>;
}

/**
 * O registrador mínimo entre as declarações de rota e o Fastify. Ele não tem
 * plugins, lifecycle ou regra de negócio: só converte método, caminho, status e
 * handler para `fastify.route`.
 */
export function registerAuthRoutes(
  fastify: FastifyInstance,
  routes: readonly AuthRoute[],
): void {
  for (const route of routes) {
    fastify.route({
      method: route.method,
      url: route.path,
      handler: async (request, reply) => {
        if (route.status !== undefined) reply.code(route.status);
        const result = await route.handler(request, reply);
        if (reply.sent) return reply;
        return result === undefined ? reply.send() : reply.send(result);
      },
    });
  }
}
