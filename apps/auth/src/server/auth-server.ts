import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { ulid } from "ulid";
import { ConsoleAuthLogger, type AuthLogger } from "../common/logger";
import { resolveRequestContext, type RequestContext } from "../common/request-context";
import { SECURITY_POLICY } from "../config/security-policy";
import type { AuthenticatedActor } from "../domain/users/user";
import { toAuthErrorResponse } from "../http/auth-error-response";
import { documentationRoutes } from "./documentation.routes";
import { authFeatureRoutes, type AuthFeatureDependencies } from "./feature.routes";
import { createAuthGuards, type AuthGuardDependencies } from "./guards";
import { healthRoutes, type HealthRouteDependencies } from "./health.routes";
import { jwksRoutes, type JwksRouteDependencies } from "./jwks.routes";
import { registerAuthRoutes, type AuthRoute } from "./routes";

export type { AuthRoute } from "./routes";

declare module "fastify" {
  interface FastifyRequest {
    authContext: RequestContext;
    /** O ator validado pelo guard, como no adaptador do Nest. */
    actor?: AuthenticatedActor;
  }
}

/**
 * O que as rotas do servidor precisam: banco para readiness, chave para JWKS,
 * guards de sessão e os use cases das features já migradas.
 */
export type AuthHttpServerDependencies = HealthRouteDependencies &
  JwksRouteDependencies &
  AuthGuardDependencies &
  AuthFeatureDependencies;

export interface AuthHttpServerOptions {
  readonly dependencies: AuthHttpServerDependencies;
  readonly logger?: AuthLogger;
  /** Rotas adicionais (as suítes registram sondas de contrato por aqui). */
  readonly routes?: readonly AuthRoute[];
}

export type AuthFallbackHandler = (
  request: IncomingMessage,
  response: ServerResponse,
) => void;

export interface AuthHttpServer {
  readonly fastify: FastifyInstance;
  readonly server: Server;
  /** As rotas ainda não migradas são entregues ao servidor em coexistência. */
  setFallback(handler: AuthFallbackHandler): void;
  listen(port: number, host: string): Promise<string>;
  close(): Promise<void>;
}

const firstHeader = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

function statusOf(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("statusCode" in error)) return undefined;
  const status = (error as { statusCode?: unknown }).statusCode;
  return typeof status === "number" ? status : undefined;
}

/**
 * O Express das rotas em coexistência não reconhecia `text/plain` nem corpo
 * sem content-type: o parser ignorava e a validação respondia 400. O Fastify
 * recusa antes, com 415; aqui a borda volta ao contrato observado.
 */
function transportStatus(status: number | undefined): number | undefined {
  return status === 415 ? 400 : status;
}

/** O parser JSON das rotas migradas, no escopo filho que as contém. */
function addMigratedBodyParsers(fastify: FastifyInstance): void {
  fastify.addContentTypeParser(
    "application/json",
    { parseAs: "string", bodyLimit: SECURITY_POLICY.maxRequestBodyBytes },
    (_request, body, done) => {
      try {
        done(null, JSON.parse(typeof body === "string" ? body : body.toString("utf8")));
      } catch {
        const error = new Error("invalid json body") as Error & { statusCode: number };
        error.statusCode = 400;
        done(error);
      }
    },
  );
}

/**
 * O servidor Fastify do Auth. Ele serve as rotas já migradas e entrega o resto
 * ao handler em coexistência (hoje o Express do Nest), preservando os
 * contratos que ainda vivem lá.
 *
 * O parser de corpo das operações migradas vive no escopo filho: assim os
 * requests do proxy continuam chegando crus ao Express, que mantém seus
 * limites de 32 KB, Leitura diária e entrega.
 */
export function createAuthHttpServer(options: AuthHttpServerOptions): AuthHttpServer {
  const logger = options.logger ?? new ConsoleAuthLogger();
  const fastify = Fastify({ logger: false, routerOptions: { ignoreTrailingSlash: true } });
  fastify.removeAllContentTypeParsers();

  const guards = createAuthGuards(options.dependencies);
  let fallback: AuthFallbackHandler | undefined;

  fastify.decorateRequest("authContext", null as unknown as RequestContext);
  fastify.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    const context = resolveRequestContext({
      receivedCorrelationId: firstHeader(request.headers["x-correlation-id"]),
      ipAddress: request.socket.remoteAddress ?? null,
      userAgent: firstHeader(request.headers["user-agent"]),
    });
    request.authContext = context;
    reply.header("X-Correlation-Id", context.correlationId);
  });

  fastify.setErrorHandler((error, request, reply) => {
    const correlationId = request.authContext?.correlationId ?? ulid();
    const mapped = toAuthErrorResponse(error, {
      correlationId,
      logger,
      status: transportStatus(statusOf(error)),
    });
    for (const [name, value] of Object.entries(mapped.headers)) reply.header(name, value);
    reply.code(mapped.status);
    return mapped.body === undefined ? reply.send() : reply.send(mapped.body);
  });

  fastify.setNotFoundHandler((request, reply) => {
    if (!fallback) return reply.code(404).send({ code: "not_found" });
    reply.hijack();
    fallback(request.raw, reply.raw);
    return reply;
  });

  registerAuthRoutes(
    fastify,
    [
      ...healthRoutes(options.dependencies),
      ...jwksRoutes(options.dependencies),
      ...documentationRoutes(),
      ...(options.routes ?? []),
    ],
    guards,
  );

  fastify.register(async (scope) => {
    addMigratedBodyParsers(scope);
    registerAuthRoutes(scope, authFeatureRoutes(options.dependencies), guards);
  });

  return {
    fastify,
    server: fastify.server,
    setFallback(handler) {
      fallback = handler;
    },
    async listen(port, host) {
      await fastify.listen({ port, host });
      const address = fastify.server.address();
      if (!address || typeof address === "string") {
        throw new Error("Auth server did not expose a TCP address");
      }
      return `http://${host}:${address.port}`;
    },
    async close() {
      await fastify.close();
    },
  };
}
