import type { ExecutionContext } from "@nestjs/common";
import { expect, test, vi } from "vitest";
import { statusOf } from "../events/testing/status-of";
import {
  AuthServiceForbiddenError,
  AuthServiceRequestFailedError,
  AuthServiceUnauthorizedError,
  type AuthServiceClient,
} from "../authenticate-user/auth-service.client";
import { AccessResource } from "./access-resource.decorator";
import { AuthServiceGuard } from "./auth-service.guard";

@AccessResource("event")
class Probe {}

function contextWith(authorization?: string, decorated = true) {
  const request: Record<string, unknown> = { headers: { authorization }, method: "GET" };
  return {
    context: { getClass: () => decorated ? Probe : class MissingPolicy {}, switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext,
    request,
  };
}

function guardWith(authorize: AuthServiceClient["authorize"]) {
  const client = { authorize: vi.fn(authorize) };
  return { guard: AuthServiceGuard.using(client), client };
}

test("attaches the actor resolved by apps/auth to the request", async () => {
  const { guard, client } = guardWith(async () => ({ userId: "auth-user-1", sessionId: "s1" }));
  const { context, request } = contextWith("Bearer test-token");

  await expect(guard.canActivate(context)).resolves.toBe(true);
  expect(request.actor).toEqual({ userId: "auth-user-1", sessionId: "s1" });
  expect(client.authorize).toHaveBeenCalledWith("Bearer test-token", "event", "read", undefined);
});

test("answers 401 without a bearer token and never calls apps/auth", async () => {
  const { guard, client } = guardWith(async () => ({ userId: "unused" }));

  expect(await statusOfThrownGuard(guard, contextWith(undefined).context)).toBe(401);
  expect(await statusOfThrownGuard(guard, contextWith("Basic abc").context)).toBe(401);
  expect(client.authorize).not.toHaveBeenCalled();
});

test("refuses a route without an explicit resource policy", async () => {
  const { guard, client } = guardWith(async () => ({ userId: "unused" }));
  expect(await statusOfThrownGuard(guard, contextWith("Bearer test-token", false).context)).toBe(503);
  expect(client.authorize).not.toHaveBeenCalled();
});

test("answers 401 when apps/auth rejects the token", async () => {
  const { guard } = guardWith(async () => {
    throw new AuthServiceUnauthorizedError();
  });
  expect(await statusOfThrownGuard(guard, contextWith("Bearer expired-token").context)).toBe(401);
});

test("answers 403 when apps/auth forbids the token", async () => {
  const { guard } = guardWith(async () => {
    throw new AuthServiceForbiddenError();
  });
  expect(await statusOfThrownGuard(guard, contextWith("Bearer guest-token").context)).toBe(403);
});

test("answers 503 when apps/auth is unreachable", async () => {
  const { guard } = guardWith(async () => {
    throw new AuthServiceRequestFailedError("timeout");
  });
  expect(await statusOfThrownGuard(guard, contextWith("Bearer test-token").context)).toBe(503);
});

async function statusOfThrownGuard(guard: AuthServiceGuard, context: ExecutionContext): Promise<number> {
  try {
    await guard.canActivate(context);
  } catch (error) {
    return statusOf(error);
  }
  throw new Error("esperava que o guard lancasse um erro");
}
