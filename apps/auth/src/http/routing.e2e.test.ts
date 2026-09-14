import { afterEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "../testing/create-test-app";

let app: TestApp | undefined;
afterEach(async () => { await app?.close(); app = undefined; });

const json = { "content-type": "application/json" };

/**
 * 401 aqui significa "a rota existe e o guard rodou". E o sinal que separa uma
 * rota registrada de uma capturada por um parametro vizinho, sem precisar de
 * banco: se `users/:userId` engolisse `users`, a listagem responderia outra
 * coisa que nao 401.
 */
describe("Route registration and ordering", () => {
  it("registers the bearer routes behind the guard", async () => {
    app = await createTestApp();

    for (const [method, path] of [["POST", "logout-all"], ["GET", "me"]] as const) {
      const response = await fetch(`${app.url}/auth/${path}`, { method });
      expect([path, response.status]).toEqual([path, 401]);
      expect(await response.text()).toBe("");
    }
  });

  it("no longer registers the step-up, password, recovery-code or admin routes", async () => {
    app = await createTestApp();

    for (const [method, path] of [
      ["POST", "step-up/start"], ["POST", "step-up/verify"], ["POST", "step-up/recover"], ["POST", "password/change"],
      ["POST", "recovery-codes/regenerate"], ["GET", "admin/users"], ["POST", "admin/invites"], ["PATCH", "admin/users/x/status"],
      ["PUT", "admin/users/x/access"], ["POST", "admin/users/x/invite/reissue"], ["DELETE", "admin/users/x/invite"], ["POST", "admin/users/x/revoke-sessions"],
    ] as const) {
      const response = await fetch(`${app.url}/auth/${path}`, { method, headers: json, body: method === "GET" ? undefined : "{}" });
      expect([method, path, response.status]).toEqual([method, path, 404]);
    }
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

  it("no longer registers the MFA completion routes", async () => {
    app = await createTestApp();

    for (const path of ["mfa/verify", "mfa/recover", "mfa/resend"]) {
      const response = await fetch(`${app.url}/auth/${path}`, { method: "POST", headers: json, body: JSON.stringify({ mfaToken: "x" }) });
      expect([path, response.status]).toEqual([path, 404]);
    }
  });

  it("answers an unknown route or an unsupported method with the generic 404", async () => {
    app = await createTestApp();

    for (const request of [
      fetch(`${app.url}/auth/does-not-exist`),
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
