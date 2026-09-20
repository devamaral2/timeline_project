import { afterEach, describe, expect, it, vi } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { PublicAuthController } from "./public-auth.controller";
import { InspectInviteUseCase } from "../invites/usecases/inspect-invite.usecase";
import { AcceptInviteUseCase } from "../authentication/usecases/accept-invite.usecase";
import { StartLoginUseCase } from "../authentication/usecases/start-login.usecase";
import { configureHttpShell } from "./request-context.middleware";

let app: INestApplication | undefined;
afterEach(async () => { await app?.close(); app = undefined; });

async function startApp(login: { execute: ReturnType<typeof vi.fn> }) {
  const module = await Test.createTestingModule({ controllers: [PublicAuthController], providers: [
    { provide: InspectInviteUseCase, useValue: { execute: vi.fn() } },
    { provide: AcceptInviteUseCase, useValue: { execute: vi.fn() } },
    { provide: StartLoginUseCase, useValue: login },
  ] }).compile();
  app = module.createNestApplication({ bodyParser: false }); configureHttpShell(app); await app.listen(0, "127.0.0.1");
  const address = app.getHttpServer().address() as { port: number };
  return `http://127.0.0.1:${address.port}`;
}

describe("POST /auth/login", () => {
  it("accepts only email and password and returns the session", async () => {
    const login = { execute: vi.fn().mockResolvedValue({ accessToken: "access", refreshToken: "refresh" }) };
    const url = await startApp(login);
    const response = await fetch(`${url}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "user@example.test", password: "secret" }) });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ accessToken: "access", refreshToken: "refresh" });
    expect(login.execute).toHaveBeenCalledWith(expect.objectContaining({ email: "user@example.test", password: "secret", context: expect.any(Object) }));
  });

  it("rejects MFA-shaped payloads", async () => {
    const login = { execute: vi.fn() };
    const url = await startApp(login);
    const response = await fetch(`${url}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "user@example.test", password: "secret", secondFactor: "otp" }) });
    expect(response.status).toBe(400);
    expect(login.execute).not.toHaveBeenCalled();
  });
});
