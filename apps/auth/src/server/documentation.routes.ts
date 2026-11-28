import { apiReference } from "@scalar/nestjs-api-reference";
import type { IncomingMessage, ServerResponse } from "node:http";
import { authOpenApiDocument } from "../http/openapi";
import type { AuthRoute } from "./routes";

const referenceHandler = apiReference({
  withFastify: true,
  pageTitle: "Braid Auth API",
  theme: "purple",
  darkMode: false,
  spec: { content: authOpenApiDocument },
}) as unknown as (request: IncomingMessage, response: ServerResponse) => void;

/**
 * O documento é estático e a referência é servida pelo Scalar diretamente no
 * Fastify. Nenhuma das duas passa por autenticação.
 */
export function documentationRoutes(): AuthRoute[] {
  return [
    {
      method: "GET",
      path: "/openapi.json",
      handler: async () => authOpenApiDocument,
    },
    {
      method: "GET",
      path: "/docs",
      handler: async (request, reply) => {
        reply.hijack();
        // O Scalar escreve os headers dele com `writeHead`; o correlation id
        // precisa já estar no socket para não sumir na resposta.
        reply.raw.setHeader("X-Correlation-Id", request.authContext.correlationId);
        referenceHandler(request.raw, reply.raw);
      },
    },
  ];
}
