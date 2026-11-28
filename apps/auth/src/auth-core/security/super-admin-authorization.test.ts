import { describe, expect, it } from "vitest";
import { AccessDeniedError, AuthenticationFailedError } from "../../common/errors";
import type { AuthenticatedActor } from "../../domain/users/user";
import type { Permission } from "../../domain/rbac/permissions";
import { requireSuperAdmin, type SuperAdminAuthorization } from "./super-admin-authorization";

const actor: AuthenticatedActor = {
  userId: "user-1",
  sessionId: "session-1",
  roles: ["admin"],
  permissions: ["*:manage"],
  denies: [],
  amr: ["pwd"],
  authTime: 0,
};

const authorizationWith = (access: { roles: string[]; permissions: Permission[]; denies: Permission[] }): SuperAdminAuthorization => ({
  currentUser: async () => ({ userId: actor.userId, email: "a@example.test", name: "A", sessionId: actor.sessionId, ...access }),
});

describe("super admin authorization", () => {
  it("accepts an actor that fully covers the super admin", async () => {
    await expect(requireSuperAdmin(actor, authorizationWith({ roles: ["admin"], permissions: ["*:manage"], denies: [] }))).resolves.toBeUndefined();
  });

  it("refuses a request without an authenticated actor as an authentication failure", async () => {
    await expect(requireSuperAdmin(undefined, authorizationWith({ roles: ["admin"], permissions: ["*:manage"], denies: [] }))).rejects.toBeInstanceOf(
      AuthenticationFailedError,
    );
  });

  it("refuses an actor whose live access does not include the full super admin", async () => {
    await expect(requireSuperAdmin(actor, authorizationWith({ roles: ["member"], permissions: ["task:read"], denies: [] }))).rejects.toBeInstanceOf(
      AccessDeniedError,
    );
  });

  it("refuses a token whose super admin is denied part of the catalog", async () => {
    await expect(
      requireSuperAdmin(actor, authorizationWith({ roles: ["admin"], permissions: ["*:manage"], denies: ["task:delete"] })),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });
});
