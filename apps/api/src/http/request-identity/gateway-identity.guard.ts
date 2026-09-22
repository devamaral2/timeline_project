import { timingSafeEqual } from "node:crypto";
import {
  CanActivate,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  type ExecutionContext,
} from "@nestjs/common";
import type { Request } from "express";
import { getServerEnv } from "../../config/env";
import type { AuthenticatedUser } from "./authenticated-user";

export interface GatewayRequest extends Request {
  actor?: AuthenticatedUser;
}

/** Aceita somente identidades encaminhadas pelo gateway Auth interno. */
@Injectable()
export class GatewayIdentityGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<GatewayRequest>();
    const configuredKey = getServerEnv().AUTH_INTERNAL_SERVICE_KEY;
    const presentedKey = request.header("x-auth-gateway-key");
    if (!configuredKey || !presentedKey) throw new UnauthorizedException();

    const expected = Buffer.from(configuredKey);
    const received = Buffer.from(presentedKey);
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
      throw new ForbiddenException();
    }

    const userId = request.header("x-auth-user-id");
    if (!userId) throw new UnauthorizedException();
    const sessionId = request.header("x-auth-session-id") || undefined;
    request.actor = { userId, sessionId };
    return true;
  }
}
