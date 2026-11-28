import { z } from "zod";
import { parseRequest } from "../../../http/validation";
import type { AuthRoute } from "../../../server/routes";
import { authenticatedActor } from "../../../server/guards";
import { isPermission } from "../../../domain/rbac/permissions";
import { SYSTEM_ROLES } from "../../../domain/rbac/system-roles";
import type { CreateInviteUseCase } from "../usecases/create-invite.usecase";

export interface CreateInviteRouteDependencies {
  readonly createInvite: Pick<CreateInviteUseCase, "execute">;
}

// Os papéis do estágio 1 são os de sistema, criados pela migração. Validar
// contra esse catálogo aqui deixa "papel desconhecido" ser um 400 de forma,
// em vez de um erro de FK descoberto no meio da transação.
const roleKeys = z
  .array(z.enum(SYSTEM_ROLES.map((role) => role.key) as [string, ...string[]]))
  .max(16)
  .refine((keys) => new Set(keys).size === keys.length, "duplicate role");
const directPermissions = z
  .array(
    z
      .object({ permission: z.string().refine(isPermission), effect: z.enum(["allow", "deny"]) })
      .strict(),
  )
  .max(64)
  .refine(
    (entries) => new Set(entries.map((entry) => entry.permission)).size === entries.length,
    "duplicate permission",
  );

const createInviteBody = z
  .object({
    email: z
      .string()
      .min(3)
      .max(320)
      .refine(
        (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim().toLowerCase()),
        "invalid email",
      ),
    name: z.string().trim().min(1).max(120),
    roleKeys,
    directPermissions,
  })
  .strict();

/** Cria o convite como superadministrador e devolve o link uma única vez. */
export function createInviteRoutes(dependencies: CreateInviteRouteDependencies): AuthRoute[] {
  return [
    {
      method: "POST",
      path: "/auth/admin/invites",
      status: 201,
      authentication: "bearer-super-admin",
      handler: async (request) => {
        const value = parseRequest(createInviteBody, request.body);
        return dependencies.createInvite.execute({
          actor: authenticatedActor(request),
          email: value.email,
          name: value.name,
          roleKeys: value.roleKeys,
          directPermissions: value.directPermissions,
          context: request.authContext,
        });
      },
    },
  ];
}
