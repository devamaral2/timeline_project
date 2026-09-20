import { AccessDeniedError } from "../../common/errors";
import { isAllowed } from "../../domain/rbac/effective-permissions";
import { coversSuperAdmin } from "../../domain/rbac/resolve-user-permissions";
import type { RbacRepository } from "./rbac/ports/rbac-repository";
import type { UserReader } from "../user-lookup/ports/user-repository";
import type { SessionRepository } from "../manage-session/ports/session-repository";
import { AuthenticationFailedError } from "../../common/errors";
import { canSignIn } from "../../domain/users/user";

export const ACCESS_RESOURCES = ["event", "tag", "task", "note", "recurrence", "agent"] as const;
export const ACCESS_ACTIONS = ["read", "create", "update", "delete", "execute"] as const;
export type AccessResource = (typeof ACCESS_RESOURCES)[number];
export type AccessAction = (typeof ACCESS_ACTIONS)[number];

export interface AccessRequest {
  userId: string;
  sessionId: string;
  resource: AccessResource;
  action: AccessAction;
  targetUserId?: string;
}

/** The auth service alone interprets roles, permissions, and ownership. */
export class AuthorizeAccessUseCase {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly users: UserReader,
    private readonly rbac: RbacRepository,
  ) {}

  async execute(input: AccessRequest): Promise<{ userId: string; sessionId: string; email: string; name: string }> {
    const [session, user] = await Promise.all([
      this.sessions.findActiveSession({ sessionId: input.sessionId, userId: input.userId }),
      this.users.findById(input.userId),
    ]);
    if (!session || !user || !canSignIn(user)) throw new AuthenticationFailedError("session or user not active");

    const access = await this.rbac.resolvedAccessOf(input.userId);
    const targetUserId = input.targetUserId ?? input.userId;
    const crossUser = targetUserId !== input.userId;
    const superAdmin = coversSuperAdmin(access);
    const roleKeys = access.roleKeys;
    const isWriter = (roleKeys.includes("member") || roleKeys.includes("admin")) && !access.denies.includes("*:manage");
    const isReader = (isWriter || roleKeys.includes("viewer")) && !access.denies.includes("*:manage");
    const canManageResource = (input.resource === "event" || input.resource === "tag") &&
      isAllowed(access, input.resource, "manage");

    if (crossUser && !superAdmin && !canManageResource) throw new AccessDeniedError("target user not authorized");

    if (input.resource === "event" || input.resource === "tag") {
      if ((input.action !== "read" && !isWriter) || input.action === "execute" || !isAllowed(access, input.resource, input.action)) {
        throw new AccessDeniedError("action not authorized");
      }
    } else {
      if (input.action === "read" ? !isReader : !isWriter) {
        throw new AccessDeniedError("action not authorized");
      }
    }

    return { userId: user.id, sessionId: session.id, email: user.email, name: user.name };
  }
}
