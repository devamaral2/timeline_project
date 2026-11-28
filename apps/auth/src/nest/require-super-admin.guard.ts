import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { actorOf, type ActorCarrier } from "../auth-core/security/request-actor";
import { AuthorizationService } from "../auth-core/security/authorization.service";
import { requireSuperAdmin } from "../auth-core/security/super-admin-authorization";

/** Adaptador temporario do Nest: a regra vive em `super-admin-authorization.ts`. */
@Injectable()
export class RequireSuperAdminGuard implements CanActivate {
  constructor(@Inject(AuthorizationService) private readonly authorization: AuthorizationService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>() as Request & ActorCarrier;
    await requireSuperAdmin(actorOf(request), this.authorization);
    return true;
  }
}
