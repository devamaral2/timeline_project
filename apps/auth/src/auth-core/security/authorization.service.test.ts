import { describe, expect, it } from "vitest";
import { AccessDeniedError, AuthenticationFailedError } from "../../common/errors";
import type { RbacRepository } from "../persistence/postgres-rbac.repository";
import type { SessionRepository } from "../persistence/postgres-session.repository";
import type { UserReader } from "../persistence/postgres-user.repository";
import { AuthorizationService } from "./authorization.service";

function subject(roleKeys: string[], permissions: string[], denies: string[] = [], active = true) {
  const sessions = { findActiveSession: async () => active ? { id: "session-1" } : null } as unknown as SessionRepository;
  const users = { findById: async () => ({ id: "user-1", email: "user@example.test", name: "User", status: "active" }) } as unknown as UserReader;
  const rbac = { resolvedAccessOf: async () => ({ roleKeys, permissions, denies }) } as unknown as RbacRepository;
  return new AuthorizationService(sessions as never, users as never, rbac as never);
}

const request = { userId: "user-1", sessionId: "session-1", resource: "task" as const, action: "update" as const };

describe("AuthorizationService", () => {
  it("allows a member to update their own task but not someone else's", async () => {
    const authorize = subject(["member"], ["task:update"]);
    await expect(authorize.execute(request)).resolves.toMatchObject({ userId: "user-1", sessionId: "session-1" });
    await expect(authorize.execute({ ...request, targetUserId: "user-2" })).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("lets an admin cross the owner boundary and honors explicit denies", async () => {
    await expect(subject(["admin"], ["*:manage"]).execute({ ...request, targetUserId: "user-2" })).resolves.toMatchObject({ userId: "user-1" });
    await expect(subject(["admin"], ["*:manage"], ["task:update"]).execute({ ...request, targetUserId: "user-2" })).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("keeps viewers read only and refuses revoked sessions", async () => {
    const viewer = subject(["viewer"], ["task:read"]);
    await expect(viewer.execute({ ...request, action: "read" })).resolves.toMatchObject({ userId: "user-1" });
    await expect(viewer.execute(request)).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(subject(["viewer"], ["task:update", "task:read"]).execute(request)).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(subject(["member"], ["task:update"], [], false).execute(request)).rejects.toBeInstanceOf(AuthenticationFailedError);
  });
});
