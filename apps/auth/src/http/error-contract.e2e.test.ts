import { afterEach, describe, expect, it } from "vitest";
import * as domainErrors from "../common/errors";
import { createTestApp, type TestApp } from "../testing/create-test-app";
import { DOMAIN_ERROR_STATUS } from "./auth-exception.filter";

let app: TestApp | undefined;
afterEach(async () => { await app?.close(); app = undefined; });

const json = { "content-type": "application/json" };

/** O corpo e comparado em **bytes**, nao em JSON: uma chave a mais, uma ordem
 *  diferente ou um espaco sobrando mudam o que o cliente recebe. */
async function bytes(response: Response): Promise<string> { return response.text(); }

describe("HTTP error contract", () => {
  it("answers every branch with the exact status and body of the matrix", async () => {
    app = await createTestApp();
    const raise = (kind: string) => fetch(`${app!.url}/testing/raise/${kind}`);

    const unauthorized = await raise("authentication");
    expect(unauthorized.status).toBe(401);
    expect(await bytes(unauthorized)).toBe("");

    const forbidden = await raise("access");
    expect(forbidden.status).toBe(403);
    expect(await bytes(forbidden)).toBe("");

    const wrongKind = await raise("token-kind");
    expect(wrongKind.status).toBe(403);
    expect(await bytes(wrongKind)).toBe("");

    const limited = await raise("rate-limit");
    expect(limited.status).toBe(429);
    expect(await bytes(limited)).toBe("");
    expect(limited.headers.get("retry-after")).toBe("43");
    expect(Number.isInteger(Number(limited.headers.get("retry-after")))).toBe(true);

    const semantic = await raise("semantic");
    expect(semantic.status).toBe(422);
    expect(await bytes(semantic)).toBe('{"code":"password_length"}');

    const conflict = await raise("conflict");
    expect(conflict.status).toBe(409);
    expect(await bytes(conflict)).toBe('{"code":"email_already_exists"}');

    const missing = await raise("not-found");
    expect(missing.status).toBe(404);
    expect(await bytes(missing)).toBe('{"code":"not_found"}');

    const unavailable = await raise("dependency");
    expect(unavailable.status).toBe(503);
    expect(await bytes(unavailable)).toBe('{"code":"service_unavailable"}');
  });

  it("gives a 500 a correlation id that matches the header, and nothing else", async () => {
    app = await createTestApp();

    const response = await fetch(`${app.url}/testing/raise/boom`);

    expect(response.status).toBe(500);
    expect(app.logger.events.at(-1)).toMatchObject({
      error: "Error",
      message: expect.stringContaining("leak-probe-9d3f"),
      stack: expect.stringContaining("Error: unhandled failure leak-probe-9d3f"),
    });
    const correlationId = response.headers.get("x-correlation-id")!;
    expect(correlationId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(await bytes(response)).toBe(`{"code":"internal_error","correlationId":"${correlationId}"}`);
  });

  it("rejects malformed JSON, an invalid shape and an oversized body", async () => {
    app = await createTestApp();

    const malformed = await fetch(`${app.url}/auth/login`, { method: "POST", headers: json, body: "{" });
    expect(malformed.status).toBe(400);
    expect(await bytes(malformed)).toBe('{"code":"invalid_request"}');

    const wrongShape = await fetch(`${app.url}/auth/login`, { method: "POST", headers: json, body: JSON.stringify({ email: 42, password: "x" }) });
    expect(wrongShape.status).toBe(400);
    expect(await bytes(wrongShape)).toBe('{"code":"invalid_request"}');

    const unknownField = await fetch(`${app.url}/auth/login`, { method: "POST", headers: json, body: JSON.stringify({ email: "a@example.test", password: "x", extra: true }) });
    expect(unknownField.status).toBe(400);

    const oversized = await fetch(`${app.url}/auth/login`, { method: "POST", headers: json, body: JSON.stringify({ email: "a@example.test", password: "a".repeat(40 * 1024) }) });
    expect(oversized.status).toBe(413);
    expect(await bytes(oversized)).toBe('{"code":"payload_too_large"}');
  });

  it("carries a generic 429 with an integer Retry-After", async () => {
    app = await createTestApp();

    const response = await fetch(`${app.url}/testing/generic-rate-limit`);

    expect(response.status).toBe(429);
    expect(await bytes(response)).toBe("");
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("keeps the taxonomy exhaustive: a new error class without a mapping fails here", () => {
    const classes = Object.entries(domainErrors)
      .filter(([, value]) => typeof value === "function" && Object.prototype.isPrototypeOf.call(Error.prototype, (value as { prototype: object }).prototype))
      .map(([name]) => name)
      .sort();

    expect(classes).toEqual(Object.keys(DOMAIN_ERROR_STATUS).sort());
  });
});
