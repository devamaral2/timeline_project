import {
  AccessDeniedError,
  AuthenticationFailedError,
  ConflictError,
  NotFoundError,
  RateLimitedError,
  RequiredDependencyUnavailableError,
  SemanticInputError,
} from "../common/errors";
import type { AuthLogger } from "../common/logger";

/**
 * A tabela de traducao de dominio para HTTP, sem framework:
 *
 * | erro                              | status | corpo                                   |
 * | --------------------------------- | ------ | --------------------------------------- |
 * | AuthenticationFailedError         | 401    | zero bytes                              |
 * | AccessDeniedError                 | 403    | zero bytes                              |
 * | RateLimitedError                  | 429    | zero bytes + Retry-After                |
 * | SemanticInputError                | 422    | { code } da allowlist                   |
 * | ConflictError                     | 409    | { code } da allowlist                   |
 * | NotFoundError                     | 404    | { code: "not_found" }                   |
 * | RequiredDependencyUnavailableError| 503    | { code: "service_unavailable" }         |
 *
 * O status de erros de transporte (corpo grande, JSON invalido, rota ausente)
 * chega pronto de quem conhece o servidor; esta funcao so decide o corpo.
 * `internalReason` nunca sai na resposta.
 */
export interface AuthErrorResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: unknown;
}

export interface AuthErrorResponseOptions {
  readonly correlationId: string;
  readonly logger: AuthLogger;
  readonly status?: number;
}

const HTTP = {
  badRequest: 400,
  unauthorized: 401,
  forbidden: 403,
  notFound: 404,
  conflict: 409,
  payloadTooLarge: 413,
  unprocessable: 422,
  tooManyRequests: 429,
  internal: 500,
  unavailable: 503,
} as const;

export function toAuthErrorResponse(exception: unknown, options: AuthErrorResponseOptions): AuthErrorResponse {
  const { correlationId, logger } = options;
  const headers = { "X-Correlation-Id": correlationId };

  if (exception instanceof AuthenticationFailedError) {
    logger.error({
      correlationId,
      status: HTTP.unauthorized,
      error: "AuthenticationFailedError",
      reason: exception.internalReason,
    });
    return { status: HTTP.unauthorized, headers };
  }
  if (exception instanceof AccessDeniedError) return { status: HTTP.forbidden, headers };
  if (exception instanceof RateLimitedError) {
    logger.error({
      correlationId,
      status: HTTP.tooManyRequests,
      error: "RateLimitedError",
      reason: exception.internalReason,
    });
    return {
      status: HTTP.tooManyRequests,
      headers: { ...headers, "Retry-After": String(Math.max(1, Math.ceil(exception.retryAfterSeconds))) },
    };
  }
  if (exception instanceof SemanticInputError) {
    return { status: HTTP.unprocessable, headers, body: { code: exception.safeCode } };
  }
  if (exception instanceof ConflictError) {
    return { status: HTTP.conflict, headers, body: { code: exception.safeCode } };
  }
  if (exception instanceof NotFoundError) {
    return { status: HTTP.notFound, headers, body: { code: "not_found" } };
  }
  if (exception instanceof RequiredDependencyUnavailableError) {
    logger.error({
      correlationId,
      status: HTTP.unavailable,
      error: "RequiredDependencyUnavailableError",
      reason: exception.internalReason,
    });
    return { status: HTTP.unavailable, headers, body: { code: "service_unavailable" } };
  }

  const status = options.status;
  if (status === HTTP.badRequest) return { status, headers, body: { code: "invalid_request" } };
  if (status === HTTP.payloadTooLarge) return { status, headers, body: { code: "payload_too_large" } };
  if (status === HTTP.tooManyRequests) {
    return { status, headers: { ...headers, "Retry-After": "1" } };
  }
  if (status === HTTP.unauthorized || status === HTTP.forbidden) return { status, headers };
  if (status === HTTP.notFound) return { status, headers, body: { code: "not_found" } };
  if (status === HTTP.unavailable) return { status, headers, body: { code: "service_unavailable" } };

  // Nao ha ramo generico de 409 de proposito: o unico conflito legitimo vem de
  // `ConflictError`, cujo codigo pertence a allowlist por construcao.
  logger.error({
    correlationId,
    status: HTTP.internal,
    error: exception instanceof Error ? exception.constructor.name : typeof exception,
    message: exception instanceof Error ? exception.message : undefined,
    stack: exception instanceof Error ? exception.stack : undefined,
  });
  return { status: HTTP.internal, headers, body: { code: "internal_error", correlationId } };
}
