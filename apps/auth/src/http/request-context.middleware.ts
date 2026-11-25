import { Injectable, type INestApplication, type NestMiddleware } from "@nestjs/common";
import { json, type NextFunction, type Request, type Response } from "express";
import { ulid } from "ulid";
import type { RequestContext } from "../common/request-context";
import { SECURITY_POLICY } from "../config/security-policy";
import { AuthExceptionFilter } from "./auth-exception.filter";
import { ConsoleAuthLogger, type AuthLogger } from "../common/logger";

declare global {
  namespace Express {
    interface Request {
      context?: RequestContext;
    }
  }
}

const correlationIdPattern = /^[A-Za-z0-9._-]{1,128}$/;

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const receivedCorrelationId = request.header("x-correlation-id");
    const correlationId =
      receivedCorrelationId && correlationIdPattern.test(receivedCorrelationId)
        ? receivedCorrelationId
        : ulid();
    const userAgent = request.header("user-agent");

    request.context = Object.freeze({
      correlationId,
      ipAddress: request.socket.remoteAddress ?? null,
      userAgent: userAgent || null,
    });
    response.setHeader("X-Correlation-Id", correlationId);
    next();
  }
}

/** Applies the identical process shell in production and real Nest E2E tests. */
export function configureHttpShell(app: INestApplication, logger: AuthLogger = new ConsoleAuthLogger()): void {
  const adapter = app.getHttpAdapter() as unknown as {
    getInstance(): { disable(setting: string): void };
    useBodyParser(type: "json", rawBody: boolean, options: { limit: number }): void;
  };
  const express = adapter.getInstance();
  express.disable("x-powered-by");

  const context = new RequestContextMiddleware();
  app.use(context.use.bind(context));
  // Quem le o corpo primeiro vence: nas rotas de corpo grande o parser de teto
  // maior roda antes e o geral, logo abaixo, encontra o corpo ja lido.
  app.use([...SECURITY_POLICY.largeBodyPaths], json({ limit: SECURITY_POLICY.maxLargeRequestBodyBytes }));
  adapter.useBodyParser("json", false, { limit: SECURITY_POLICY.maxRequestBodyBytes });
  app.useGlobalFilters(new AuthExceptionFilter(logger));
}
