import type { ExecutionContext } from "@nestjs/common";
import { expect, test, vi } from "vitest";
import { statusOf } from "../events/testing/status-of";
import {
  AuthServiceForbiddenError,
  AuthServiceRequestFailedError,
  AuthServiceUnauthorizedError,
  type AuthServiceClient,
} from "./auth-service.client";
import { AuthServiceGuard } from "./auth-service.guard";

function contextWith(authorization?: string) {
  const request: Record<string, unknown> = { headers: { authorization } };
  return {
    context: { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext,
    request,
  };
}

function guardWith(me: AuthServiceClient["me"]) {
  const client = { me: vi.fn(me) };
  return { guard: AuthServiceGuard.using(client), client };
}

test("attaches the actor resolved by apps/auth to the request", async () => {
  const { guard, client } = guardWith(async () => ({ userId: "auth-user-1", roles: ["member"], permissions: [] }));
  const { context, request } = contextWith("Bearer test-token");

  await expect(guard.canActivate(context)).resolves.toBe(true);
  expect(request.actor).toEqual({ userId: "auth-user-1", roles: ["member"], permissions: [] });
  expect(client.me).toHaveBeenCalledWith("Bearer test-token");
});

test("answers 401 without a bearer token and never calls apps/auth", async () => {
  const { guard, client } = guardWith(async () => ({ userId: "unused" }));

  expect(await statusOfThrownGuard(guard, contextWith(undefined).context)).toBe(401);
  expect(await statusOfThrownGuard(guard, contextWith("Basic abc").context)).toBe(401);
  expect(client.me).not.toHaveBeenCalled();
});

test("answers 401 when apps/auth rejects the token", async () => {
  const { guard } = guardWith(async () => {
    throw new AuthServiceUnauthorizedError();
  });

  expect(await statusOfThrownGuard(guard, contextWith("Bearer expired-token").context)).toBe(401);
});

test("answers 403 when apps/auth recognizes the token but it is not a user token", async () => {
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
