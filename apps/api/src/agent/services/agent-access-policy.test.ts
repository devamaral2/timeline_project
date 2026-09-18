import { describe, expect, test } from "vitest";
import { AgentTargetForbiddenError } from "../errors/agent.errors";
import { assertCanActFor } from "./agent-access-policy";

describe("assertCanActFor", () => {
  test("allows acting on yourself without any permission", () => {
    expect(() => assertCanActFor({ userId: "u1" }, "u1")).not.toThrow();
  });

  test("allows a super admin to act on another user", () => {
    const admin = { userId: "admin", permissions: ["*:manage"], denies: [] };
    expect(() => assertCanActFor(admin, "u1")).not.toThrow();
  });

  test("rejects a super admin that has any deny", () => {
    const admin = { userId: "admin", permissions: ["*:manage"], denies: ["event:delete"] };
    expect(() => assertCanActFor(admin, "u1")).toThrow(AgentTargetForbiddenError);
  });

  test("rejects when denies are unknown", () => {
    const admin = { userId: "admin", permissions: ["*:manage"] };
    expect(() => assertCanActFor(admin, "u1")).toThrow(AgentTargetForbiddenError);
  });

  test("rejects a non-admin even with other permissions", () => {
    const user = { userId: "u2", permissions: ["event:manage", "event:read"], denies: [] };
    expect(() => assertCanActFor(user, "u1")).toThrow(AgentTargetForbiddenError);
  });
});
