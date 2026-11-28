import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { ulid } from "ulid";
import { ConsoleAuthLogger, type AuthLogger } from "../common/logger";
import { resolveRequestContext, type RequestContext } from "../common/request-context";
import { toAuthErrorResponse } from "../http/auth-error-response";
import { documentationRoutes } from "./documentation.routes";
import { healthRoutes, type HealthRouteDependencies } from "./health.routes";
import { jwksRoutes, type JwksRouteDependencies } from "./jwks.routes";
import { apiProxyRoutes, type ApiProxyDependencies } from "./proxy.routes";
import { registerAuthRoutes, type AuthRoute } from "./routes";

export type { AuthRoute } from "./routes";

declare module "fastify" {
  interface FastifyRequest {
    authContext: RequestContext;
  }
}

/** O que as rotas do servidor precisam: banco para readiness, chave para JWKS. */
export type AuthHttpServerDependencies = HealthRouteDependencies &
  JwksRouteDependencies & {
    /** Quando presente, o próprio Fastify serve o proxy Auth -> API. */
    readonly proxy?: ApiProxyDependencies;
  };

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

function badRequest(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 400 });
}

/**
 * O parser das rotas do proxy reproduz o `json()` do Express: corpo vazio vira
 * `{}`, só objeto/array é aceito e JSON malformado é 400 antes da autenticação.
 * O `parseAs: "buffer"` entrega o corpo cru ao leitor; o limite vem da rota.
 */
function parseProxyJsonBody(
  _request: FastifyRequest,
  body: Buffer,
  done: (error: Error | null, result?: unknown) => void,
): void {
  const text = body.toString("utf8");
  if (text.length === 0) {
    done(null, {});
    return;
  }
  try {
    const value = JSON.parse(text) as unknown;
    if (value === null || typeof value !== "object") {
      done(badRequest("invalid JSON body"), undefined);
      return;
    }
    done(null, value);
  } catch {
    done(badRequest("invalid JSON body"), undefined);
  }
}

/**
 * Os parsers vivem num escopo filho, só das rotas do proxy. O handler de
 * coexistência (404) continua no escopo raiz, que não tem parser, e por isso
 * recebe o corpo cru intacto para o Nest/Express consumir.
 */
function registerProxyRoutes(fastify: FastifyInstance, proxy: ApiProxyDependencies): void {
  void fastify.register(async (scope) => {
    scope.addContentTypeParser("application/json", { parseAs: "buffer" }, parseProxyJsonBody);
    scope.addContentTypeParser("*", { parseAs: "buffer" }, (_request, _body, done) => {
      done(null, undefined);
    });
    registerAuthRoutes(scope, apiProxyRoutes(proxy));
  });
}

function statusOf(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("statusCode" in error)) return undefined;
  const status = (error as { statusCode?: unknown }).statusCode;
  return typeof status === "number" ? status : undefined;
}

/**
 * O servidor Fastify do Auth. Ele serve apenas as rotas já migradas e entrega o
 * resto ao handler em coexistência (hoje o Express do Nest), preservando os
 * contratos que ainda vivem lá.
 *
 * Os parsers de corpo do escopo raiz continuam removidos de propósito: assim o
 * corpo cru chega intacto à rota em coexistência, que mantém seus limites de
 * 32 KB, Leitura diária e entrega. As rotas do proxy têm parsers próprios num
 * escopo filho, com o limite declarado em cada rota.
 */
export function createAuthHttpServer(options: AuthHttpServerOptions): AuthHttpServer {
  const logger = options.logger ?? new ConsoleAuthLogger();
  const fastify = Fastify({ logger: false, routerOptions: { ignoreTrailingSlash: true } });
  fastify.removeAllContentTypeParsers();

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
      status: statusOf(error),
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

  registerAuthRoutes(fastify, [
    ...healthRoutes(options.dependencies),
    ...jwksRoutes(options.dependencies),
    ...documentationRoutes(),
    ...(options.routes ?? []),
  ]);

  if (options.dependencies.proxy) registerProxyRoutes(fastify, options.dependencies.proxy);

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
