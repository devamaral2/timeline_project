import { afterEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "../testing/create-test-app";

let app: TestApp | undefined;
afterEach(async () => { await app?.close(); app = undefined; });

const json = { "content-type": "application/json" };

describe("Route registration and ordering", () => {
  it("keeps only invite creation under administration", async () => {
    app = await createTestApp();

    expect((await fetch(`${app.url}/auth/admin/invites`, { method: "POST", headers: json, body: "{}" })).status).toBe(401);
    expect((await fetch(`${app.url}/auth/admin/users`)).status).toBe(404);
  });

  it("registers authenticated session routes behind the bearer guard", async () => {
    app = await createTestApp();

    for (const path of ["logout-all"]) {
      const response = await fetch(`${app.url}/auth/${path}`, { method: "POST", headers: json, body: "{}" });
      expect([path, response.status]).toEqual([path, 401]);
      expect(await response.text()).toBe("");
    }
    expect((await fetch(`${app.url}/auth/me`)).status).toBe(401);
  });

  it("registers the public routes without a guard in front of them", async () => {
    app = await createTestApp();

    // Sem bearer, mas com corpo invalido: 400 prova que a rota existe e que o
    // corpo chegou ao schema, nao a um guard.
    for (const path of ["invites/inspect", "invites/accept", "login"]) {
      const response = await fetch(`${app.url}/auth/${path}`, { method: "POST", headers: json, body: JSON.stringify({ nope: true }) });
      expect([path, response.status]).toEqual([path, 400]);
    }
  });

  it("answers an unknown route or an unsupported method with the generic 404", async () => {
    app = await createTestApp();

    for (const request of [
      fetch(`${app.url}/auth/does-not-exist`),
      fetch(`${app.url}/auth/admin/usersssss`),
      fetch(`${app.url}/auth/login`, { method: "GET" }),
      fetch(`${app.url}/health/live`, { method: "POST" }),
    ]) {
      const response = await request;
      expect(response.status).toBe(404);
      expect(await response.text()).toBe('{"code":"not_found"}');
    }
  });

  it("serves the fixed infrastructure routes", async () => {
    app = await createTestApp();

    expect((await fetch(`${app.url}/health/live`)).status).toBe(200);
    const jwks = await fetch(`${app.url}/.well-known/jwks.json`);
    expect(jwks.status).toBe(200);
    expect(jwks.headers.get("etag")).toMatch(/^"sha256-/);
  });
});
