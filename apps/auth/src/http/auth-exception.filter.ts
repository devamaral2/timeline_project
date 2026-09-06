import {
  Catch,
  HttpException,
  HttpStatus,
  type ArgumentsHost,
  type ExceptionFilter,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { ulid } from "ulid";
import {
  AccessDeniedError,
  AuthenticationFailedError,
  ConflictError,
  FeatureSuspendedError,
  NotFoundError,
  RateLimitedError,
  RequiredDependencyUnavailableError,
  SemanticInputError,
} from "../common/errors";
import { ConsoleAuthLogger, type AuthLogger } from "../common/logger";

/**
 * A traducao completa de dominio para HTTP. E o unico ponto do servico que
 * escolhe status code, e a tabela abaixo e o contrato:
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
 * | FeatureSuspendedError             | 410    | { code } da allowlist                   |
 *
 * `internalReason` **nunca** sai na resposta: ele vai para o log estruturado e
 * para a auditoria. `Error.message` tambem nunca e serializado -- so o 500
 * carrega algo variavel no corpo, e mesmo assim apenas o correlation id, que o
 * usuario ja recebeu no cabecalho.
 */
export const DOMAIN_ERROR_STATUS = {
  AuthenticationFailedError: HttpStatus.UNAUTHORIZED,
  AccessDeniedError: HttpStatus.FORBIDDEN,
  RateLimitedError: HttpStatus.TOO_MANY_REQUESTS,
  SemanticInputError: HttpStatus.UNPROCESSABLE_ENTITY,
  ConflictError: HttpStatus.CONFLICT,
  NotFoundError: HttpStatus.NOT_FOUND,
  RequiredDependencyUnavailableError: HttpStatus.SERVICE_UNAVAILABLE,
  FeatureSuspendedError: HttpStatus.GONE,
} as const satisfies Readonly<Record<string, number>>;

@Catch()
export class AuthExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: AuthLogger = new ConsoleAuthLogger()) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const correlationId = request.context?.correlationId ?? ulid();
    response.setHeader("X-Correlation-Id", correlationId);

    // Os erros que carregam `internalReason` sao os unicos cujo motivo real
    // some da resposta. Registra-lo aqui e o que mantem o incidente
    // investigavel sem que o corpo diga nada.
    if (exception instanceof AuthenticationFailedError) {
      this.logger.error({ correlationId, status: HttpStatus.UNAUTHORIZED, error: "AuthenticationFailedError", reason: exception.internalReason });
      return void response.status(HttpStatus.UNAUTHORIZED).end();
    }
    if (exception instanceof AccessDeniedError) return void response.status(HttpStatus.FORBIDDEN).end();
    if (exception instanceof RateLimitedError) {
      this.logger.error({ correlationId, status: HttpStatus.TOO_MANY_REQUESTS, error: "RateLimitedError", reason: exception.internalReason });
      response.setHeader("Retry-After", String(Math.max(1, Math.ceil(exception.retryAfterSeconds))));
      return void response.status(HttpStatus.TOO_MANY_REQUESTS).end();
    }
    if (exception instanceof SemanticInputError) return void response.status(HttpStatus.UNPROCESSABLE_ENTITY).json({ code: exception.safeCode });
    if (exception instanceof ConflictError) return void response.status(HttpStatus.CONFLICT).json({ code: exception.safeCode });
    if (exception instanceof NotFoundError) return void response.status(HttpStatus.NOT_FOUND).json({ code: "not_found" });
    if (exception instanceof RequiredDependencyUnavailableError) {
      this.logger.error({ correlationId, status: HttpStatus.SERVICE_UNAVAILABLE, error: "RequiredDependencyUnavailableError", reason: exception.internalReason });
      return void response.status(HttpStatus.SERVICE_UNAVAILABLE).json({ code: "service_unavailable" });
    }
    if (exception instanceof FeatureSuspendedError) return void response.status(HttpStatus.GONE).json({ code: exception.safeCode });

    const status = this.statusOf(exception);
    if (status === HttpStatus.BAD_REQUEST) return void response.status(status).json({ code: "invalid_request" });
    if (status === HttpStatus.PAYLOAD_TOO_LARGE) return void response.status(status).json({ code: "payload_too_large" });
    if (status === HttpStatus.TOO_MANY_REQUESTS) {
      response.setHeader("Retry-After", "1");
      return void response.status(status).end();
    }
    if (status === HttpStatus.UNAUTHORIZED || status === HttpStatus.FORBIDDEN) return void response.status(status).end();
    if (status === HttpStatus.NOT_FOUND) return void response.status(status).json({ code: "not_found" });
    if (status === HttpStatus.SERVICE_UNAVAILABLE) return void response.status(status).json({ code: "service_unavailable" });

    // Nao ha ramo generico de 409 de proposito: o unico conflito legitimo vem
    // de `ConflictError`, cujo codigo pertence a allowlist por construcao. Um
    // 409 vindo de qualquer outro lugar seria um codigo fora da allowlist
    // vazando, e cair no 500 abaixo e a resposta honesta.
    this.logger.error({
      correlationId, status: HttpStatus.INTERNAL_SERVER_ERROR,
      error: exception instanceof Error ? exception.constructor.name : typeof exception,
      message: exception instanceof Error ? exception.message : undefined,
    });
    return void response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ code: "internal_error", correlationId });
  }

  private statusOf(exception: unknown): number | undefined {
    if (exception instanceof HttpException) return exception.getStatus();
    if (typeof exception === "object" && exception !== null && "status" in exception) {
      const status = (exception as { status?: unknown }).status;
      return typeof status === "number" ? status : undefined;
    }
    return undefined;
  }
}
