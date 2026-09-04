import { afterEach, describe, expect, it } from "vitest";
import { createTestApp, LEAK_PROBE, type TestApp } from "../testing/create-test-app";

let app: TestApp | undefined;
afterEach(async () => { await app?.close(); app = undefined; });

const json = { "content-type": "application/json" };

describe("Secret redaction", () => {
  it("never returns the private reason, in any branch, while the log keeps it", async () => {
    app = await createTestApp();

    for (const kind of ["authentication", "access", "rate-limit", "not-found", "dependency", "boom"]) {
      const response = await fetch(`${app.url}/testing/raise/${kind}`);
      const body = await response.text();
      expect(body).not.toContain(LEAK_PROBE);
      // Nem o motivo, nem a mensagem do Error: o corpo so tem codigo e, no 500,
      // o correlation id que o cliente ja recebeu no cabecalho.
      expect(body).not.toMatch(/unknown email|missing permission|too many tries|no such user|twilio down|unhandled failure/);
    }

    // O motivo real nao se perdeu: ele foi para o log estruturado.
    expect(app.logger.events.some((event) => event.reason?.includes(LEAK_PROBE))).toBe(true);
    expect(app.logger.events.some((event) => event.message?.includes(LEAK_PROBE))).toBe(true);
  });

  it("never echoes the submitted credential back to the caller", async () => {
    app = await createTestApp();
    const password = "senha-secreta-que-nao-pode-voltar";
    const phone = "+5511987654321";

    const badShape = await fetch(`${app.url}/auth/invites/accept`, { method: "POST", headers: json, body: JSON.stringify({ token: "t", password, phone, channel: "carrier-pigeon" }) });
    expect(badShape.status).toBe(400);
    const body = await badShape.text();
    expect(body).toBe('{"code":"invalid_request"}');
    expect(body).not.toContain(password);
    expect(body).not.toContain(phone);
  });

  it("keeps the health and JWKS surface free of anything but its own payload", async () => {
    app = await createTestApp();

    const live = await fetch(`${app.url}/health/live`);
    expect(await live.text()).toBe('{"status":"ok"}');

    const jwks = await fetch(`${app.url}/.well-known/jwks.json`);
    const published = await jwks.text();
    expect(published).not.toMatch(/encrypted_private_key|privateKey|"d"\s*:/);
  });

  it("says nothing about an unknown route beyond the generic code", async () => {
    app = await createTestApp();

    const unknown = await fetch(`${app.url}/auth/${LEAK_PROBE}`);

    expect(unknown.status).toBe(404);
    expect(await unknown.text()).toBe('{"code":"not_found"}');
  });
});
