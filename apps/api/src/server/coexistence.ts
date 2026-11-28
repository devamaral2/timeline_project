import type { FastifyInstance } from "fastify";
import type { ApiRoute } from "../http/api-route";

/** O minimo que o adaptador precisa do Express/Nest — sem importar Express no nucleo. */
interface RawRequest {
  method: string;
  path: string;
}

type Next = (error?: unknown) => void;

interface ExpressApplicationLike {
  use(handler: (request: RawRequest, response: unknown, next: Next) => void): void;
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** `/api/tasks/:taskId` vira `^/api/tasks/[^/]+/?$`; o trailing slash e o mesmo da linha de base. */
function patternOf(path: string): RegExp {
  const segments = path.split("/").map((segment) => (segment.startsWith(":") ? "[^/]+" : escapeRegExp(segment)));
  return new RegExp(`^${segments.join("/")}/?$`);
}

function matcherOf(routes: readonly ApiRoute[]): (method: string, path: string) => boolean {
  const compiled = routes.map((route) => ({ method: route.method, pattern: patternOf(route.path) }));
  return (method, path) => compiled.some((route) => route.method === method && route.pattern.test(path));
}

/**
 * Coexistencia temporaria: o Express/Nest continua dono da porta, e somente as
 * operacoes ja declaradas para o Fastify sao entregues a ele, antes de qualquer
 * body parser do Express. Quem nao casa com uma rota migrada segue para o Nest.
 */
export function delegateToFastify(
  app: ExpressApplicationLike,
  fastify: FastifyInstance,
  routes: readonly ApiRoute[],
): void {
  const matches = matcherOf(routes);
  app.use((request, response, next) => {
    if (!matches(request.method, request.path)) {
      next();
      return;
    }
    fastify.routing(request as never, response as never);
  });
}
