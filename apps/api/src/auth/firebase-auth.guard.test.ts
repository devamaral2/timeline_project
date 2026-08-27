import { expect, test, vi } from "vitest";

const verifyFirebaseToken = vi.hoisted(() => vi.fn(async () => ({ userId: "firebase-user-1" })));

vi.mock("./verify-firebase-token", () => ({ verifyFirebaseToken }));

import type { ExecutionContext } from "@nestjs/common";
import { statusOf } from "../events/testing/status-of";
import { FirebaseAuthGuard } from "./firebase-auth.guard";

function contextWith(authorization?: string) {
  const request: Record<string, unknown> = { headers: { authorization } };
  return {
    context: { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext,
    request,
  };
}

test("attaches the authenticated actor to the request", async () => {
  const { context, request } = contextWith("Bearer test-token");

  await expect(new FirebaseAuthGuard().canActivate(context)).resolves.toBe(true);
  expect(request.actor).toEqual({ userId: "firebase-user-1" });
});

test("answers 401 without a bearer token", async () => {
  const { context } = contextWith(undefined);

  const status = await statusOfThrownGuard(context);
  expect(status).toBe(401);
});

test("answers 401 when the token is rejected", async () => {
  verifyFirebaseToken.mockRejectedValueOnce(new Error("Firebase ID token has expired"));
  const { context } = contextWith("Bearer expired-token");

  const status = await statusOfThrownGuard(context);
  expect(status).toBe(401);
});

async function statusOfThrownGuard(context: ExecutionContext): Promise<number> {
  try {
    await new FirebaseAuthGuard().canActivate(context);
  } catch (error) {
    return statusOf(error);
  }
  throw new Error("esperava que o guard lancasse um erro");
}
