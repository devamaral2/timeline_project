import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
  type LoggerService,
} from "@nestjs/common";
import type { Response } from "express";
import {
  EventNotFoundError,
  EventOwnershipError,
  EventRevisionConflictError,
  EventValidationError,
} from "@repo/entities";
import {
  EventAgentUndecidedError,
  InvalidInputError,
  LlmUnavailableError,
} from "../events/errors/event-agent.errors";

/**
 * Traduz os erros de dominio para status HTTP. Substitui o `mutationErrorResponse`
 * que cada controller repetia.
 *
 * Diferenca em relacao ao codigo anterior: erro inesperado (banco fora do ar,
 * bug) responde 500, e nao mais 401. O 401 antigo fazia o front tratar falha de
 * infraestrutura como sessao expirada.
 */
@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  /** Injetavel para que os testes possam silenciar a saida: o Logger do Nest
   *  escreve direto no stdout e escaparia do `silent` do Vitest. */
  constructor(private readonly logger: LoggerService = new Logger(DomainExceptionFilter.name)) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const message = exception instanceof Error ? exception.message : "Invalid request";
    const status = this.statusFor(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(message, exception instanceof Error ? exception.stack : undefined);
    } else {
      this.logger.warn(`${status} — ${message}`);
    }

    response.status(status).json({ error: message });
  }

  private statusFor(exception: unknown): number {
    if (exception instanceof HttpException) return exception.getStatus();
    if (exception instanceof InvalidInputError) return HttpStatus.BAD_REQUEST;
    if (exception instanceof EventAgentUndecidedError) return HttpStatus.UNPROCESSABLE_ENTITY;
    if (exception instanceof LlmUnavailableError) return HttpStatus.BAD_GATEWAY;
    if (exception instanceof EventValidationError) return HttpStatus.BAD_REQUEST;
    if (exception instanceof EventOwnershipError) return HttpStatus.FORBIDDEN;
    if (exception instanceof EventNotFoundError) return HttpStatus.NOT_FOUND;
    if (exception instanceof EventRevisionConflictError) return HttpStatus.CONFLICT;
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }
}
