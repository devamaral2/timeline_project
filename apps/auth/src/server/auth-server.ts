import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import type { Server } from "node:http";
import { ulid } from "ulid";
import { ConsoleAuthLogger, type AuthLogger } from "../common/logger";
import { resolveRequestContext, type RequestContext } from "../common/request-context";
import { SECURITY_POLICY } from "../config/security-policy";
import type { AuthenticatedActor } from "../domain/users/user";
import { toAuthErrorResponse } from "../http/auth-error-response";
import { documentationRoutes } from "./documentation.routes";
import { authFeatureRoutes, type AuthFeatureDependencies } from "./feature.routes";
import { createAuthGuards, type AuthGuardDependencies, type AuthGuards } from "./guards";
import { healthRoutes, type HealthRouteDependencies } from "./health.routes";
import { jwksRoutes, type JwksRouteDependencies } from "./jwks.routes";
import { apiProxyRoutes, type ApiProxyDependencies } from "./proxy.routes";
import { registerAuthRoutes, type AuthRoute } from "./routes";

export type { AuthRoute } from "./routes";

declare module "fastify" {
  interface FastifyRequest {
    authContext: RequestContext;
    /** O ator validado pelo guard da rota. */
    actor?: AuthenticatedActor;
  }
}

/**
 * O que as rotas do servidor precisam: banco para readiness, chave para JWKS,
 * guards de sessão, os use cases das features já migradas e, quando ligado, o
 * proxy Auth -> API.
 */
export type AuthHttpServerDependencies = HealthRouteDependencies &
  JwksRouteDependencies &
  AuthGuardDependencies &
  AuthFeatureDependencies & {
    /** Quando presente, o próprio Fastify serve o proxy Auth -> API. */
    readonly proxy?: ApiProxyDependencies;
  };

export interface AuthHttpServerOptions {
  readonly dependencies: AuthHttpServerDependencies;
  readonly logger?: AuthLogger;
  /** Rotas adicionais (as suítes registram sondas de contrato por aqui). */
  readonly routes?: readonly AuthRoute[];
}

export interface AuthHttpServer {
  readonly fastify: FastifyInstance;
  readonly server: Server;
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
 * Os parsers do proxy vivem num escopo filho próprio. O escopo raiz continua
 * sem parser, e as rotas públicas (health, JWKS, documentação e sondas) não
 * pagam o custo de ler corpo. O limite de cada rota vem declarado nela.
 */
function registerProxyRoutes(
  fastify: FastifyInstance,
  proxy: ApiProxyDependencies,
  guards: AuthGuards,
): void {
  void fastify.register(async (scope) => {
    scope.addContentTypeParser("application/json", { parseAs: "buffer" }, parseProxyJsonBody);
    scope.addContentTypeParser("*", { parseAs: "buffer" }, (_request, _body, done) => {
      done(null, undefined);
    });
    registerAuthRoutes(scope, apiProxyRoutes(proxy), guards);
  });
}

function statusOf(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("statusCode" in error)) return undefined;
  const status = (error as { statusCode?: unknown }).statusCode;
  return typeof status === "number" ? status : undefined;
}

/**
 * O Express das rotas antigas não reconhecia `text/plain` nem corpo sem
 * content-type: o parser ignorava e a validação respondia 400. O Fastify recusa
 * antes, com 415; aqui a borda volta ao contrato observado.
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
 * O servidor Fastify do Auth. Ele serve sozinho todas as rotas declaradas:
 * infraestrutura, proxies e features.
 *
 * O escopo raiz continua sem parsers de propósito: health, JWKS, documentação
 * e sondas não leem corpo. Cada família que precisa de corpo ganha um escopo
 * filho com os seus parsers: as features com o JSON comum e o proxy com o
 * `json()` do Express e o limite declarado em cada rota.
 */
export function createAuthHttpServer(options: AuthHttpServerOptions): AuthHttpServer {
  const logger = options.logger ?? new ConsoleAuthLogger();
  const fastify = Fastify({ logger: false, routerOptions: { ignoreTrailingSlash: true } });
  fastify.removeAllContentTypeParsers();

  const guards = createAuthGuards(options.dependencies);

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

  fastify.setNotFoundHandler((_request, reply) => reply.code(404).send({ code: "not_found" }));

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

  if (options.dependencies.proxy) registerProxyRoutes(fastify, options.dependencies.proxy, guards);

  return {
    fastify,
    server: fastify.server,
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
