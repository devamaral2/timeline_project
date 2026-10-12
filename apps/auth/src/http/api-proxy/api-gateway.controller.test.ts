import type { Request, Response } from "express";
import { afterEach, describe, expect, it } from "vitest";
import type { AuthorizationService, AccessRequest } from "../../auth-core/security/authorization.service";
import type { RuntimeEnv } from "../../config/env";
import type { AuthenticatedActor } from "../../domain/users/user";
import { startFakeHttpServer, type FakeHttpServer } from "../../testing/fake-http-server";
import { ApiGatewayController, policyFor } from "./api-gateway.controller";

describe("policyFor", () => {
  it.each([
    ["/api/events", "event"],
    ["/api/tags", "tag"],
    ["/api/tasks", "task"],
    ["/api/notes", "note"],
    ["/api/notes/note-1", "note"],
    ["/api/recurrences", "recurrence"],
    ["/api/ai/chat", "agent"],
  ])("maps %s to the %s resource", (path, resource) => {
    expect(policyFor("GET", path).resource).toBe(resource);
  });

  it.each([
    ["GET", "read"],
    ["POST", "create"],
    ["PATCH", "update"],
    ["PUT", "update"],
    ["DELETE", "delete"],
  ])("maps %s on notes to the %s action", (method, action) => {
    expect(policyFor(method, "/api/notes")).toEqual({ resource: "note", action });
  });

  it("refuses paths and methods without a policy", () => {
    expect(() => policyFor("GET", "/api/unknown")).toThrow("No gateway policy for /api/unknown");
    expect(() => policyFor("TRACE", "/api/notes")).toThrow("No gateway policy for TRACE /api/notes");
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

  it("authorizes the note resource and proxies POST /api/notes to the API with the gateway identity", async () => {
    const { authorized, sent, received } = await forward("POST", "/api/notes", { title: "Nota" });

    expect(authorized).toEqual([
      { userId: "user-1", sessionId: "session-1", resource: "note", action: "create", targetUserId: undefined },
    ]);
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ method: "POST", path: "/api/notes" });
    expect(received[0]?.headers["x-auth-gateway-key"]).toBe("gateway-key");
    expect(received[0]?.headers["x-auth-user-id"]).toBe("user-1");
    expect(received[0]?.headers["x-auth-session-id"]).toBe("session-1");
    expect(received[0]?.headers.authorization).toBeUndefined();
    expect(sent.status).toBe(201);
    expect(sent.body?.toString()).toBe("created");
  });

  it("keeps the query string when proxying GET /api/notes", async () => {
    const { authorized, received } = await forward("GET", "/api/notes?eventId=event-1", undefined);

    expect(authorized[0]).toMatchObject({ resource: "note", action: "read" });
    expect(received[0]).toMatchObject({ method: "GET", path: "/api/notes?eventId=event-1" });
  });
});
