import type { AuthenticatedUser } from "../../auth/authenticated-user";
import { AgentTargetForbiddenError } from "../errors/agent.errors";

/** Curinga de super admin do apps/auth (`apps/auth/src/rbac/permissions.ts`). */
export const SUPER_ADMIN_PERMISSION = "*:manage";

/**
 * O apps/auth só considera super admin quem tem `*:manage` e nenhum deny — e
 * como todo deny aponta para uma permissão real (CHECK no banco dele), qualquer
 * deny já tira o ator dessa condição. `denies` ausente conta como "não sei", e
 * "não sei" não é admin.
 */
export function assertCanActFor(actor: AuthenticatedUser, targetUserId: string): void {
  if (actor.userId === targetUserId) return;

  const isSuperAdmin =
    (actor.permissions ?? []).includes(SUPER_ADMIN_PERMISSION) &&
    actor.denies !== undefined &&
    actor.denies.length === 0;

  if (!isSuperAdmin) throw new AgentTargetForbiddenError();
}
