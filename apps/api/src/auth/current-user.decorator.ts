import { UnauthorizedException, createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { AuthenticatedRequest } from "./firebase-auth.guard";
import type { AuthenticatedUser } from "./verify-firebase-token";

/** So resolve em rotas protegidas pelo `FirebaseAuthGuard`, que popula `actor`. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.actor) throw new UnauthorizedException("Missing authenticated user");
    return request.actor;
  },
);
