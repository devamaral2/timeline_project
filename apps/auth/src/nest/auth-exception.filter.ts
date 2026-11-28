import {
  Catch,
  HttpException,
  type ArgumentsHost,
  type ExceptionFilter,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { ulid } from "ulid";
import { ConsoleAuthLogger, type AuthLogger } from "../common/logger";
import { toAuthErrorResponse } from "../http/auth-error-response";

/**
 * Adaptador temporario do Nest para a traducao de erros. A tabela vive em
 * `http/auth-error-response.ts`, sem framework; aqui so se resolve o status de
 * erros de transporte (HttpException, body-parser) e se escreve a resposta.
 */
@Catch()
export class AuthExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: AuthLogger = new ConsoleAuthLogger()) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const correlationId = request.context?.correlationId ?? ulid();

    const mapped = toAuthErrorResponse(exception, {
      correlationId,
      logger: this.logger,
      status: this.statusOf(exception),
    });

    for (const [name, value] of Object.entries(mapped.headers)) response.setHeader(name, value);
    if (mapped.body === undefined) return void response.status(mapped.status).end();
    return void response.status(mapped.status).json(mapped.body);
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
