import { describe, expect, it } from "vitest";
import { ACCESS_RESOURCES } from "../../auth-core/security/authorization.service";
import { policyFor } from "./gateway-policy";

const ROTA_ANTIGA = "/api/events"; // a rota antiga: o gateway deve recusá-la

describe("policyFor", () => {
  it.each([
    ["/api/tasks", "task"],
    ["/api/tasks/task-1", "task"],
    ["/api/tags", "tag"],
    ["/api/artifacts", "artifact"],
    ["/api/artifacts/artifact-1", "artifact"],
    ["/api/recurrences", "recurrence"],
    ["/api/ai/chat", "agent"],
    ["/api/requests", "agent"],
    ["/api/requests/request-1/steps", "agent"],
  ])("maps %s to the %s resource", (path, resource) => {
    expect(policyFor("GET", path).resource).toBe(resource);
  });

  it.each([
    ["GET", "read"],
    ["POST", "create"],
    ["PATCH", "update"],
    ["PUT", "update"],
    ["DELETE", "delete"],
  ])("maps %s on artifacts to the %s action", (method, action) => {
    expect(policyFor(method, "/api/artifacts")).toEqual({ resource: "artifact", action });
  });

  it.each([
    ["GET", "read"],
    ["POST", "execute"],
  ])("maps %s on requests to the %s action of the agent resource", (method, action) => {
    expect(policyFor(method, "/api/requests")).toEqual({ resource: "agent", action });
  });

  it("refuses the removed old task and note routes", () => {
    expect(() => policyFor("GET", ROTA_ANTIGA)).toThrow(`No gateway policy for ${ROTA_ANTIGA}`);
    expect(() => policyFor("POST", ROTA_ANTIGA)).toThrow(`No gateway policy for ${ROTA_ANTIGA}`);
    expect(() => policyFor("GET", `${ROTA_ANTIGA}/task-1`)).toThrow(`No gateway policy for ${ROTA_ANTIGA}/task-1`);
    expect(() => policyFor("GET", "/api/notes")).toThrow("No gateway policy for /api/notes");
    expect(() => policyFor("GET", "/api/notes/note-1")).toThrow("No gateway policy for /api/notes/note-1");
  });

  it("refuses paths and methods without a policy", () => {
    expect(() => policyFor("GET", "/api/unknown")).toThrow("No gateway policy for /api/unknown");
    expect(() => policyFor("TRACE", "/api/artifacts")).toThrow("No gateway policy for TRACE /api/artifacts");
  });

  it("keeps the access resources in step with the policy", () => {
    expect(ACCESS_RESOURCES).toContain("artifact");
    expect(ACCESS_RESOURCES).toEqual(["task", "tag", "artifact", "recurrence", "agent"]);
    expect(ACCESS_RESOURCES).not.toContain("note");
  });
});
