import { createHash } from "node:crypto";
import { BadRequestException, ConflictException, UnprocessableEntityException, type ExecutionContext } from "@nestjs/common";
import { firstValueFrom, of, throwError } from "rxjs";
import { describe, expect, test, vi } from "vitest";
import { IdempotencyInterceptor } from "./idempotency.interceptor";
import { InMemoryIdempotencyStore } from "./testing/in-memory-idempotency-store";

interface FakeRequest {
  method: string;
  body: unknown;
  actor?: { userId: string };
  route: { path: string };
  header(name: string): string | undefined;
}

function contextFor(options: { key?: string; body?: unknown; path?: string; userId?: string; method?: string }) {
  const headers = new Map<string, string>(options.key ? [["idempotency-key", options.key]] : []);
  const setHeader = vi.fn();
  const request: FakeRequest = {
    method: options.method ?? "POST",
    body: options.body ?? { name: "x" },
    actor: { userId: options.userId ?? "owner" },
    route: { path: options.path ?? "/api/artifacts" },
    header: (name) => headers.get(name.toLowerCase()),
  };
  const context = {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({ setHeader }) }),
  } as unknown as ExecutionContext;
  return { context, setHeader };
}

function setup() {
  const store = new InMemoryIdempotencyStore();
  const interceptor = new IdempotencyInterceptor(store);
  const handler = vi.fn(() => of({ artifactId: "artifact-1" }));
  return { store, interceptor, handler };
}

describe("IdempotencyInterceptor", () => {
  test("without the header the handler runs every time", async () => {
    const { interceptor, handler } = setup();
    const { context } = contextFor({});

    await firstValueFrom(interceptor.intercept(context, { handle: handler }));
    await firstValueFrom(interceptor.intercept(context, { handle: handler }));

    expect(handler).toHaveBeenCalledTimes(2);
  });

  test("a repeated key replays the first response without running the handler again", async () => {
    const { interceptor, handler } = setup();
    const first = contextFor({ key: "resumo:2026-11-03" });
    const second = contextFor({ key: "resumo:2026-11-03" });

    const created = await firstValueFrom(interceptor.intercept(first.context, { handle: handler }));
    const replayed = await firstValueFrom(interceptor.intercept(second.context, { handle: handler }));

    expect(created).toEqual({ artifactId: "artifact-1" });
    expect(replayed).toEqual({ artifactId: "artifact-1" });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(second.setHeader).toHaveBeenCalledWith("Idempotent-Replayed", "true");
    expect(first.setHeader).not.toHaveBeenCalled();
  });

  test("the key is scoped by user and by route", async () => {
    const { interceptor, handler } = setup();

    await firstValueFrom(interceptor.intercept(contextFor({ key: "k" }).context, { handle: handler }));
    await firstValueFrom(interceptor.intercept(contextFor({ key: "k", userId: "other" }).context, { handle: handler }));
    await firstValueFrom(interceptor.intercept(contextFor({ key: "k", path: "/api/recurrences" }).context, { handle: handler }));

    expect(handler).toHaveBeenCalledTimes(3);
  });

  test("the same key with a different body is refused", async () => {
    const { interceptor, handler } = setup();
    await firstValueFrom(interceptor.intercept(contextFor({ key: "k", body: { a: 1 } }).context, { handle: handler }));

    await expect(
      firstValueFrom(interceptor.intercept(contextFor({ key: "k", body: { a: 2 } }).context, { handle: handler })),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  test("a request that arrives while the first is running gets a conflict", async () => {
    const { store, interceptor, handler } = setup();
    const body = { name: "x" };
    const requestHash = createHash("sha256").update(JSON.stringify(body)).digest("hex");
    await store.claim({ userId: "owner", scope: "/api/artifacts", key: "k", requestHash });

    await expect(
      firstValueFrom(interceptor.intercept(contextFor({ key: "k", body }).context, { handle: handler })),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(handler).not.toHaveBeenCalled();
  });

  test("a failed handler frees the key for a retry", async () => {
    const { interceptor } = setup();
    const failing = vi.fn(() => throwError(() => new Error("boom")));
    const working = vi.fn(() => of({ artifactId: "artifact-2" }));

    await expect(
      firstValueFrom(interceptor.intercept(contextFor({ key: "k" }).context, { handle: failing })),
    ).rejects.toThrow("boom");
    const retried = await firstValueFrom(interceptor.intercept(contextFor({ key: "k" }).context, { handle: working }));

    expect(retried).toEqual({ artifactId: "artifact-2" });
  });

  test("routes outside the creation list ignore the header", async () => {
    const { interceptor, handler } = setup();
    const { context } = contextFor({ key: "k", path: "/api/requests" });

    await firstValueFrom(interceptor.intercept(context, { handle: handler }));
    await firstValueFrom(interceptor.intercept(context, { handle: handler }));

    expect(handler).toHaveBeenCalledTimes(2);
  });

  test("a malformed key is a bad request", () => {
    const { interceptor, handler } = setup();

    expect(() => interceptor.intercept(contextFor({ key: "has space" }).context, { handle: handler })).toThrow(
      BadRequestException,
    );
  });
});
