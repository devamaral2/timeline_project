import { Inject, Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import { AccessDeniedError, AuthenticationFailedError } from "../../common/errors";
import { coversSuperAdmin } from "../../domain/rbac/resolve-user-permissions";
import { AuthorizationService } from "./authorization.service";
import type { AuthenticatedActor } from "../../domain/users/user";

/**
 * Todo `/auth/admin` exige o super-admin **inteiro**: o `*:manage` literal e a
 * cobertura de todas as acoes do catalogo.
 *
 * Um token com `*:manage` mais um `deny event:delete` nao passa. Aceitar esse
 * ator seria deixa-lo administrar um painel que ele nao consegue operar por
 * completo, e no estagio 1 nao ha permissao administrativa parcial -- nem
 * `user:manage` sozinho abre estas rotas.
 */
@Injectable()
export class RequireSuperAdminGuard implements CanActivate {
  constructor(@Inject(AuthorizationService) private readonly authorization: AuthorizationService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const actor = (context.switchToHttp().getRequest<Request>() as Request & { actor?: AuthenticatedActor }).actor;
    if (!actor) throw new AuthenticationFailedError("missing authenticated actor");
    const current = await this.authorization.currentUser(actor);
    if (!coversSuperAdmin({ roleKeys: current.roles, permissions: current.permissions, denies: current.denies })) {
      throw new AccessDeniedError("actor does not cover super admin");
    }
    return true;
  }
}
