import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

export type AuthHttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

/**
 * `ALL` é o `@All` do proxy: a operação existe em qualquer método comum. O
 * `HEAD` não entra na lista porque o Fastify o deriva de `GET`.
 */
export type AuthRouteMethod = AuthHttpMethod | "ALL" | readonly AuthHttpMethod[];

const ALL_METHODS: readonly AuthHttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];

/** Uma operação HTTP do Auth declarada sem decorators. */
export interface AuthRoute {
  readonly method: AuthRouteMethod;
  readonly path: string;
  /** Status de sucesso declarado; quando omitido, o Fastify responde 200. */
  readonly status?: number;
  /**
   * Teto do corpo desta operação. O Fastify aplica o limite durante o parser
   * da rota, antes de qualquer hook de autenticação, como o Express fazia.
   */
  readonly bodyLimit?: number;
  readonly handler: (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => unknown | Promise<unknown>;
}

/**
 * O registrador mínimo entre as declarações de rota e o Fastify. Ele não tem
 * plugins, lifecycle ou regra de negócio: só converte método, caminho, status,
 * limite de corpo e handler para `fastify.route`.
 */
export function registerAuthRoutes(
  fastify: FastifyInstance,
  routes: readonly AuthRoute[],
): void {
  for (const route of routes) {
    const method = route.method === "ALL"
      ? [...ALL_METHODS]
      : typeof route.method === "string" ? route.method : [...route.method];
    fastify.route({
      method,
      url: route.path,
      bodyLimit: route.bodyLimit,
      handler: async (request, reply) => {
        if (route.status !== undefined) reply.code(route.status);
        const result = await route.handler(request, reply);
        if (reply.sent) return reply;
        return result === undefined ? reply.send() : reply.send(result);
      },
    });
  }
}
