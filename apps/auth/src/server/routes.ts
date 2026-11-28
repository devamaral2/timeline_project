import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AuthGuards } from "./guards";

/** Como a operação autentica quem chama. */
export type AuthRouteAuthentication = "bearer" | "bearer-super-admin";

/** Uma operação HTTP do Auth declarada sem decorators. */
export interface AuthRoute {
  readonly method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
  readonly path: string;
  /** Status de sucesso declarado; quando omitido, o Fastify responde 200. */
  readonly status?: number;
  /** Política de autenticação: bearer de sessão ou bearer + superadministrador. */
  readonly authentication?: AuthRouteAuthentication;
  readonly handler: (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => unknown | Promise<unknown>;
}

function preHandlersOf(
  route: AuthRoute,
  guards: AuthGuards,
): ((request: FastifyRequest) => Promise<void>)[] | undefined {
  if (route.authentication === "bearer") return [guards.bearer];
  if (route.authentication === "bearer-super-admin") return [guards.bearer, guards.superAdmin];
  return undefined;
}

/**
 * O registrador mínimo entre as declarações de rota e o Fastify. Ele não tem
 * plugins, lifecycle ou regra de negócio: só converte método, caminho, status,
 * política de autenticação e handler para `fastify.route`.
 */
export function registerAuthRoutes(
  fastify: FastifyInstance,
  routes: readonly AuthRoute[],
  guards: AuthGuards,
): void {
  for (const route of routes) {
    fastify.route({
      method: route.method,
      url: route.path,
      preHandler: preHandlersOf(route, guards),
      handler: async (request, reply) => {
        if (route.status !== undefined) reply.code(route.status);
        const result = await route.handler(request, reply);
        if (reply.sent) return reply;
        return result === undefined ? reply.send() : reply.send(result);
      },
    });
  }
}
