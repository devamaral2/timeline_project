import { Injectable, type INestApplication, type NestMiddleware } from "@nestjs/common";
import { json, type NextFunction, type Request, type Response } from "express";
import type { RequestContext } from "../common/request-context";
import { resolveRequestContext } from "../common/request-context";
import { SECURITY_POLICY } from "../config/security-policy";
import { ConsoleAuthLogger, type AuthLogger } from "../common/logger";
import { AuthExceptionFilter } from "./auth-exception.filter";

declare global {
  namespace Express {
    interface Request {
      context?: RequestContext;
    }
  }
}

/**
 * Adaptador temporario do Nest/Express. A montagem do contexto vive em
 * `common/request-context.ts` e nao conhece transporte.
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const context = resolveRequestContext({
      receivedCorrelationId: request.header("x-correlation-id"),
      ipAddress: request.socket.remoteAddress ?? null,
      userAgent: request.header("user-agent"),
    });
    request.context = context;
    response.setHeader("X-Correlation-Id", context.correlationId);
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
  app.use([...SECURITY_POLICY.deliveryBodyPaths], json({ limit: SECURITY_POLICY.maxDeliveryBodyBytes }));
  adapter.useBodyParser("json", false, { limit: SECURITY_POLICY.maxRequestBodyBytes });
  app.useGlobalFilters(new AuthExceptionFilter(logger));
}
