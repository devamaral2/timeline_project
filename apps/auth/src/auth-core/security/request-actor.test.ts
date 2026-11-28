import { describe, expect, it } from "vitest";
import type { AuthenticatedActor } from "../../domain/users/user";
import { actorOf, setActor } from "./request-actor";

const actor: AuthenticatedActor = {
  userId: "user-1",
  sessionId: "session-1",
  roles: ["member"],
  permissions: [],
  denies: [],
  amr: ["pwd"],
  authTime: 0,
};

describe("request actor", () => {
  it("attaches and reads the authenticated actor without a framework", () => {
    const request: { actor?: AuthenticatedActor } = {};

    setActor(request, actor);

    expect(actorOf(request)).toBe(actor);
  });

  it("reports no actor on an unauthenticated request", () => {
    expect(actorOf({})).toBeUndefined();
  });
});
