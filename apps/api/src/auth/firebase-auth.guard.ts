import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import type { Request } from "express";
import { getBearerToken } from "./auth-header";
import { verifyFirebaseToken, type AuthenticatedUser } from "./verify-firebase-token";

export interface AuthenticatedRequest extends Request {
  actor?: AuthenticatedUser;
}

/**
 * Valida o ID token do Firebase e anexa o ator ao request, de onde o decorator
 * `@CurrentUser()` o le. Aplicado por rota: as leituras publicas de timeline e
 * de tags seguem sem exigir token, como antes.
 */
@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    try {
      request.actor = await verifyFirebaseToken(getBearerToken(request.headers.authorization));
    } catch (error) {
      throw new UnauthorizedException(
        error instanceof Error ? error.message : "Invalid request",
      );
    }
    return true;
  }
}
