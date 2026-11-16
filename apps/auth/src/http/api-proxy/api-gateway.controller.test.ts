import type { Request, Response } from "express";
import { afterEach, describe, expect, it } from "vitest";
import { ACCESS_RESOURCES, type AuthorizationService, type AccessRequest } from "../../auth-core/security/authorization.service";
import type { RuntimeEnv } from "../../config/env";
import type { AuthenticatedActor } from "../../domain/users/user";
import { startFakeHttpServer, type FakeHttpServer } from "../../testing/fake-http-server";
import { ApiGatewayController, policyFor } from "./api-gateway.controller";

describe("policyFor", () => {
  it.each([
    ["/api/events", "task"],
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

  it("refuses the removed task and note routes", () => {
    expect(() => policyFor("GET", "/api/tasks")).toThrow("No gateway policy for /api/tasks");
    expect(() => policyFor("POST", "/api/tasks")).toThrow("No gateway policy for /api/tasks");
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

describe("ApiGatewayController forwarding", () => {
  let upstream: FakeHttpServer | undefined;

  afterEach(async () => {
    await upstream?.close();
    upstream = undefined;
  });

  async function forward(method: string, originalUrl: string, body: unknown) {
    upstream = await startFakeHttpServer(() => ({ status: 201, body: "created" }));
    const authorized: AccessRequest[] = [];
    const authorize = { execute: async (input: AccessRequest) => { authorized.push(input); } } as unknown as AuthorizationService;
    const env = { apiServiceUrl: upstream.url, internalServiceKey: "gateway-key" } as RuntimeEnv;
    const request = {
      method,
      originalUrl,
      path: originalUrl.split("?")[0],
      headers: { "content-type": "application/json", authorization: "Bearer user-token", host: "auth.test" },
    } as unknown as Request;
    const sent: { status?: number; body?: Buffer } = {};
    const response = {
      status(code: number) { sent.status = code; return this; },
      setHeader() {},
      send(payload: Buffer) { sent.body = payload; },
    } as unknown as Response;
    const actor: AuthenticatedActor = { userId: "user-1", sessionId: "session-1" } as AuthenticatedActor;

    await new ApiGatewayController(authorize, env).forward(request, response, body, actor);
    return { authorized, sent, received: upstream.requests };
  }

  it("authorizes the artifact resource and proxies POST /api/artifacts to the API with the gateway identity", async () => {
    const { authorized, sent, received } = await forward("POST", "/api/artifacts", { title: "Nota" });

    expect(authorized).toEqual([
      { userId: "user-1", sessionId: "session-1", resource: "artifact", action: "create", targetUserId: undefined },
    ]);
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ method: "POST", path: "/api/artifacts" });
    expect(received[0]?.headers["x-auth-gateway-key"]).toBe("gateway-key");
    expect(received[0]?.headers["x-auth-user-id"]).toBe("user-1");
    expect(received[0]?.headers["x-auth-session-id"]).toBe("session-1");
    expect(received[0]?.headers.authorization).toBeUndefined();
    expect(sent.status).toBe(201);
    expect(sent.body?.toString()).toBe("created");
  });

  it("keeps the query string when proxying GET /api/artifacts", async () => {
    const { authorized, received } = await forward("GET", "/api/artifacts?eventId=event-1", undefined);

    expect(authorized[0]).toMatchObject({ resource: "artifact", action: "read" });
    expect(received[0]).toMatchObject({ method: "GET", path: "/api/artifacts?eventId=event-1" });
  });

  it("authorizes POST /api/requests as the agent execute action and checks the body userId", async () => {
    const { authorized, received } = await forward("POST", "/api/requests", { userId: "user-2", text: "oi" });

    expect(authorized[0]).toEqual({
      userId: "user-1",
      sessionId: "session-1",
      resource: "agent",
      action: "execute",
      targetUserId: "user-2",
    });
    expect(received[0]).toMatchObject({ method: "POST", path: "/api/requests" });
  });

  it("authorizes GET /api/requests as the agent read action", async () => {
    const { authorized } = await forward("GET", "/api/requests?status=open", undefined);

    expect(authorized[0]).toMatchObject({ resource: "agent", action: "read" });
  });
});
