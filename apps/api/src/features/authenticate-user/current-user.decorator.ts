import { UnauthorizedException, createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { AuthenticatedRequest } from "../authorize-user/auth-service.guard";
import type { AuthenticatedUser } from "./authenticated-user";

/** So resolve em rotas protegidas pelo `AuthServiceGuard`, que popula `actor`. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.actor) throw new UnauthorizedException("Missing authenticated user");
    return request.actor;
  },
);
