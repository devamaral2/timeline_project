import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import type { Request } from "express";
import { getBearerToken } from "../authenticate-user/auth-header";
import {
  AuthServiceClient,
  AuthServiceForbiddenError,
  AuthServiceRequestFailedError,
  AuthServiceUnauthorizedError,
} from "../authenticate-user/auth-service.client";
import type { AuthenticatedUser } from "../authenticate-user/authenticated-user";
import { ACCESS_RESOURCE_METADATA, actionForMethod, type AccessResource } from "./access-resource.decorator";

export interface AuthenticatedRequest extends Request {
  actor?: AuthenticatedUser;
}

@Injectable()
export class AuthServiceGuard implements CanActivate {
  private client?: Pick<AuthServiceClient, "authorize">;

  static using(client: Pick<AuthServiceClient, "authorize">): AuthServiceGuard {
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
      this.client ??= new AuthServiceClient();
      const resource = Reflect.getMetadata(ACCESS_RESOURCE_METADATA, context.getClass()) as AccessResource | undefined;
      if (!resource) throw new ServiceUnavailableException("Resource policy missing");
      const targetUserId = resource === "agent" && request.method === "POST" &&
        typeof request.body?.userId === "string" ? request.body.userId : undefined;
      request.actor = await this.client.authorize(
        authorization as string,
        resource,
        actionForMethod(request.method, resource),
        targetUserId,
      );
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
