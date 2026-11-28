import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { API_BODY_LIMIT_BYTES } from "../config/body-limits";
import { BadRequestError, ConflictError, HttpError } from "../common/http-errors";
import { httpStatusFor } from "../common/http-status";
import { Logger, type LogSink } from "../common/logger";
import type { IdempotencyStore } from "../domain/ports";
import type { ApiRoute, ApiRouteOperation } from "../http/api-route";
import { IDEMPOTENCY_KEY_FORMAT, idempotencyRequestHash } from "../http/idempotency/idempotency-key";
import { authenticateRequest } from "../http/request-identity/gateway-identity";
import { documentationFor } from "./api-documentation";

export interface RegisterApiRoutesOptions {
  /** A chave interna que o gateway Auth apresenta; lida uma vez no composition root. */
  authInternalServiceKey: string | undefined;
  idempotencyStore: IdempotencyStore;
  logger?: LogSink;
}

const BODY_TOO_LARGE = "FST_ERR_CTP_BODY_TOO_LARGE";

const CORS_METHODS = "GET,HEAD,PUT,PATCH,POST,DELETE";

/** O preflight do CORS: o navegador manda `OPTIONS` com o metodo que quer usar. */
function isCorsPreflight(request: FastifyRequest): boolean {
  return request.method === "OPTIONS" && Boolean(request.headers["access-control-request-method"]);
}

/** As respostas do CORS do Express: a origem liberada e, no preflight, metodo e headers. */
function applyCors(request: FastifyRequest, reply: FastifyReply): void {
  reply.header("access-control-allow-origin", "*");
  if (!isCorsPreflight(request)) return;
  reply.header("access-control-allow-methods", CORS_METHODS);
  const requestedHeaders = request.headers["access-control-request-headers"];
  if (requestedHeaders) {
    reply.header("access-control-allow-headers", requestedHeaders);
    reply.header("vary", "Access-Control-Request-Headers");
  }
}

/**
 * O servidor Fastify da API, com as opcoes que preservam a linha de base HTTP.
 *
 * O CORS liga so fora do loopback, onde a API e alcancavel pela rede local. O
 * preflight nao casa com nenhuma rota (nao ha rota `OPTIONS`), entao ele e
 * respondido pelo 404 handler — como o middleware do Express respondia antes da
 * autenticacao.
 */
export function createFastifyInstance(options: { bodyLimit?: number; cors?: boolean } = {}): FastifyInstance {
  const app = Fastify({
    bodyLimit: options.bodyLimit ?? API_BODY_LIMIT_BYTES,
    // O Express tratava `/api/tasks/` como `/api/tasks`.
    routerOptions: { ignoreTrailingSlash: true },
    logger: false,
  });
  if (options.cors) {
    app.addHook("onRequest", (request, reply, done) => {
      applyCors(request, reply);
      done();
    });
  }
  // Rota desconhecida e metodo nao registrado mantem o 404 do Express e o mesmo corpo `{ error }`.
  app.setNotFoundHandler((request, reply) => {
    if (options.cors && isCorsPreflight(request)) {
      applyCors(request, reply);
      void reply.code(204).send();
      return;
    }
    void reply.code(404).send({ error: `Cannot ${request.method} ${request.url}` });
  });
  return app;
}

/**
 * Os parsers preservam o que os clientes veem hoje: JSON invalido e 400 com a
 * mensagem do parser, corpo vazio de JSON vira objeto (a validacao decide), e
 * content-type fora de JSON deixa o corpo ausente.
 */
function configureBodyParsers(app: FastifyInstance): void {
  app.removeContentTypeParser("text/plain");
  app.addContentTypeParser("text/plain", (_request, _payload, done) => done(null, undefined));
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_request, body, done) => {
    const text = typeof body === "string" ? body : body.toString("utf8");
    if (text === "") return done(null, {});
    try {
      done(null, JSON.parse(text));
    } catch (error) {
      done(new BadRequestError((error as Error).message), undefined);
    }
  });
  app.addContentTypeParser("*", (_request, _payload, done) => done(null, undefined));
}

function isBodyTooLarge(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === BODY_TOO_LARGE;
}

function header(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * O registrador declarativo: converte `ApiRoute` para o Fastify e aplica a
 * identidade, a idempotencia e o corpo `{ error }`. Nao tem plugins proprios,
 * lifecycle nem regra de negocio.
 */
export function registerApiRoutes(
  app: FastifyInstance,
  routes: readonly ApiRoute[],
  options: RegisterApiRoutesOptions,
): void {
  const logger = options.logger ?? new Logger("ApiErrorHandler");

  configureBodyParsers(app);
  app.setErrorHandler((error, _request, reply) => {
    if (isBodyTooLarge(error)) {
      // A linha de base da API, herdada do body-parser do Express: o excesso e
      // 500 com esta mensagem, nao 413.
      logger.error("request entity too large");
      reply.code(500).send({ error: "request entity too large" });
      return;
    }

    const status = httpStatusFor(error);
    const message = error instanceof Error ? error.message : "Invalid request";
    if (status >= 500) logger.error(message, error instanceof Error ? error.stack : undefined);
    else logger.warn(`${status} — ${message}`);
    reply.code(status).send({ error: message });
  });

  for (const route of routes) {
    app.route({
      method: route.method,
      url: route.path,
      handler: (request, reply) => handleRoute(route, request, reply, options),
    });
  }
}

/**
 * A documentacao do servidor: o documento e a referencia interativa saem das
 * rotas registradas, sem reflection. As duas rotas sao publicas e ficam fora da
 * autenticacao do gateway.
 */
export async function registerDocumentation(
  app: FastifyInstance,
  routes: readonly ApiRouteOperation[],
): Promise<void> {
  const documentation = await documentationFor(routes);
  app.get("/openapi.json", (_request, reply) => {
    void reply.type("application/json; charset=utf-8").send(documentation.document);
  });
  app.get("/docs", (_request, reply) => {
    void reply.type("text/html; charset=utf-8").send(documentation.html);
  });
}

async function handleRoute(
  route: ApiRoute,
  request: FastifyRequest,
  reply: FastifyReply,
  options: RegisterApiRoutesOptions,
): Promise<unknown> {
  const actor = authenticateRequest(route.authentication, request.headers, options.authInternalServiceKey);
  const execute = () =>
    route.handler({
      params: request.params as Record<string, string | undefined>,
      query: request.query as Record<string, string | string[] | undefined>,
      body: request.body,
      headers: request.headers,
      actor,
    });

  const result = route.idempotent
    ? await runIdempotent(route, request, reply, options.idempotencyStore, actor.userId, execute)
    : await execute();

  const status = route.statusWhenEmpty !== undefined && result === undefined ? route.statusWhenEmpty : route.status;
  if (status === 204) return reply.code(204).send();
  return reply.code(status).send(result);
}

async function runIdempotent(
  route: ApiRoute,
  request: FastifyRequest,
  reply: FastifyReply,
  store: IdempotencyStore,
  userId: string,
  execute: () => Promise<unknown> | unknown,
): Promise<unknown> {
  const key = header(request, "idempotency-key");
  if (!key) return execute();
  if (!IDEMPOTENCY_KEY_FORMAT.test(key)) throw new BadRequestError("Invalid Idempotency-Key");

  const ref = { userId, scope: route.path, key };
  const claim = await store.claim({ ...ref, requestHash: idempotencyRequestHash(request.body) });
  switch (claim.kind) {
    case "replay":
      reply.header("Idempotent-Replayed", "true");
      return claim.response;
    case "in_progress":
      throw new ConflictError("A request with this Idempotency-Key is in progress");
    case "mismatch":
      throw new HttpError(422, "Idempotency-Key was already used with a different request");
    case "claimed": {
      let result: unknown;
      try {
        result = await execute();
      } catch (error) {
        await store.release(ref).catch(() => undefined);
        throw error;
      }
      await store.complete({ ...ref, response: result });
      return result;
    }
  }
}
