import { UnauthorizedException, createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { GatewayRequest } from "./gateway-identity.guard";
import type { AuthenticatedUser } from "./authenticated-user";

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<GatewayRequest>();
    if (!request.actor) throw new UnauthorizedException("Missing gateway identity");
    return request.actor;
  },
);
