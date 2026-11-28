import type { CurrentUserResult } from "./authorization.service";
import { AccessDeniedError, AuthenticationFailedError } from "../../common/errors";
import { coversSuperAdmin } from "../../domain/rbac/resolve-user-permissions";
import type { AuthenticatedActor } from "../../domain/users/user";

export interface SuperAdminAuthorization {
  currentUser(actor: AuthenticatedActor): Promise<CurrentUserResult>;
}

/**
 * Todo `/auth/admin` exige o super-admin **inteiro**: o `*:manage` literal e a
 * cobertura de todas as acoes do catalogo.
 *
 * Um token com `*:manage` mais um `deny task:delete` nao passa. Aceitar esse
 * ator seria deixa-lo administrar um painel que ele nao consegue operar por
 * completo, e no estagio 1 nao ha permissao administrativa parcial -- nem
 * `user:manage` sozinho abre estas rotas.
 */
export async function requireSuperAdmin(
  actor: AuthenticatedActor | undefined,
  authorization: SuperAdminAuthorization,
): Promise<void> {
  if (!actor) throw new AuthenticationFailedError("missing authenticated actor");
  const current = await authorization.currentUser(actor);
  if (!coversSuperAdmin({ roleKeys: current.roles, permissions: current.permissions, denies: current.denies })) {
    throw new AccessDeniedError("actor does not cover super admin");
  }
}
