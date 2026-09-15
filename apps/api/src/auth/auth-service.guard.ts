import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import type { Request } from "express";
import { getBearerToken } from "./auth-header";
import {
  AuthServiceClient,
  AuthServiceForbiddenError,
  AuthServiceRequestFailedError,
  AuthServiceUnauthorizedError,
} from "./auth-service.client";
import type { AuthenticatedUser } from "./authenticated-user";

export interface AuthenticatedRequest extends Request {
  actor?: AuthenticatedUser;
}

/**
 * Autentica delegando a GET /auth/me do apps/auth e anexa o ator ao request,
 * de onde o decorator `@CurrentUser()` o le. Header sem bearer nem chega a
 * rede. Falha de rede, timeout ou 5xx do apps/auth viram 503 — nao se
 * confundem com o 401 de uma credencial recusada.
 */
@Injectable()
export class AuthServiceGuard implements CanActivate {
  // Sem parametro de construtor: com emitDecoratorMetadata o Nest tentaria
  // injetar o client pelo DI, e nenhum modulo o registra.
  private client?: Pick<AuthServiceClient, "me">;

  /** Para testes: um guard que fala com o client dado em vez do apps/auth real. */
  static using(client: Pick<AuthServiceClient, "me">): AuthServiceGuard {
    const guard = new AuthServiceGuard();
    guard.client = client;
    return guard;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;

    try {
      getBearerToken(authorization);
    } catch (error) {
      throw new UnauthorizedException(error instanceof Error ? error.message : "Invalid request");
    }

    try {
      this.client ??= sharedClient();
      request.actor = await this.client.me(authorization as string);
    } catch (error) {
      if (error instanceof AuthServiceUnauthorizedError) throw new UnauthorizedException(error.message);
      if (error instanceof AuthServiceForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof AuthServiceRequestFailedError) {
        throw new ServiceUnavailableException("Authentication service unavailable");
      }
      throw error;
    }

    return true;
  }
}

let shared: AuthServiceClient | undefined;

// Cada controller ganha sua instancia do guard; o client (e a leitura do env)
// e um so.
function sharedClient(): AuthServiceClient {
  shared ??= new AuthServiceClient();
  return shared;
}
