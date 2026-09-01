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
  NotFoundError,
  RateLimitedError,
  RequiredDependencyUnavailableError,
  SemanticInputError,
} from "../common/errors";

@Catch()
export class AuthExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const correlationId = request.context?.correlationId ?? ulid();
    response.setHeader("X-Correlation-Id", correlationId);

    if (exception instanceof AuthenticationFailedError) return void response.status(HttpStatus.UNAUTHORIZED).end();
    if (exception instanceof AccessDeniedError) return void response.status(HttpStatus.FORBIDDEN).end();
    if (exception instanceof RateLimitedError) {
      response.setHeader("Retry-After", String(Math.max(1, Math.ceil(exception.retryAfterSeconds))));
      return void response.status(HttpStatus.TOO_MANY_REQUESTS).end();
    }
    if (exception instanceof SemanticInputError) {
      return void response.status(HttpStatus.UNPROCESSABLE_ENTITY).json({ code: exception.safeCode });
    }
    if (exception instanceof ConflictError) {
      return void response.status(HttpStatus.CONFLICT).json({ code: exception.safeCode });
    }
    if (exception instanceof NotFoundError) return void response.status(HttpStatus.NOT_FOUND).json({ code: "not_found" });
    if (exception instanceof RequiredDependencyUnavailableError) {
      return void response.status(HttpStatus.SERVICE_UNAVAILABLE).json({ code: "service_unavailable" });
    }

    const status = this.statusOf(exception);
    if (status === HttpStatus.BAD_REQUEST) return void response.status(status).json({ code: "invalid_request" });
    if (status === HttpStatus.PAYLOAD_TOO_LARGE) return void response.status(status).json({ code: "payload_too_large" });
    if (status === HttpStatus.UNAUTHORIZED || status === HttpStatus.FORBIDDEN || status === HttpStatus.TOO_MANY_REQUESTS) {
      return void response.status(status).end();
    }
    if (status === HttpStatus.NOT_FOUND) return void response.status(status).json({ code: "not_found" });
    if (status === HttpStatus.CONFLICT) return void response.status(status).json({ code: "conflict" });
    if (status === HttpStatus.SERVICE_UNAVAILABLE) return void response.status(status).json({ code: "service_unavailable" });
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
