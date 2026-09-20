import { describe, expect, it } from "vitest";
import { AccessDeniedError, AuthenticationFailedError } from "../../common/errors";
import type { RbacRepository } from "./rbac/ports/rbac-repository";
import type { SessionRepository } from "../manage-session/ports/session-repository";
import type { UserReader } from "../user-lookup/ports/user-repository";
import { AuthorizeAccessUseCase } from "./authorize-access.usecase";

function subject(roleKeys: string[], permissions: string[], denies: string[] = [], active = true) {
  const sessions = { findActiveSession: async () => active ? { id: "session-1" } : null } as unknown as SessionRepository;
  const users = { findById: async () => ({ id: "user-1", email: "user@example.test", name: "User", status: "active" }) } as unknown as UserReader;
  const rbac = { resolvedAccessOf: async () => ({ roleKeys, permissions, denies }) } as unknown as RbacRepository;
  return new AuthorizeAccessUseCase(sessions, users, rbac);
}

const request = { userId: "user-1", sessionId: "session-1", resource: "event" as const, action: "update" as const };

describe("AuthorizeAccessUseCase", () => {
  it("allows a member to update their own event but not someone else's", async () => {
    const authorize = subject(["member"], ["event:update"]);
    await expect(authorize.execute(request)).resolves.toMatchObject({ userId: "user-1", sessionId: "session-1" });
    await expect(authorize.execute({ ...request, targetUserId: "user-2" })).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("lets an admin cross the owner boundary and honors explicit denies", async () => {
    await expect(subject(["admin"], ["*:manage"]).execute({ ...request, targetUserId: "user-2" })).resolves.toMatchObject({ userId: "user-1" });
    await expect(subject(["admin"], ["*:manage"], ["event:update"]).execute({ ...request, targetUserId: "user-2" })).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("keeps viewers read only and refuses revoked sessions", async () => {
    const viewer = subject(["viewer"], ["event:read"]);
    await expect(viewer.execute({ ...request, action: "read" })).resolves.toMatchObject({ userId: "user-1" });
    await expect(viewer.execute(request)).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(subject(["viewer"], ["event:update", "event:read"]).execute(request)).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(subject(["member"], ["event:update"], [], false).execute(request)).rejects.toBeInstanceOf(AuthenticationFailedError);
  });
});
