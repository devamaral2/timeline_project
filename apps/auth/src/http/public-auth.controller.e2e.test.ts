import { afterEach, describe, expect, it, vi } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { PublicAuthController } from "./public-auth.controller";
import { LoginUseCase } from "../authentication/usecases/login.usecase";
import { AuthenticationFailedError } from "../common/errors";
import { configureHttpShell } from "./request-context.middleware";
import { RecordingAuthLogger } from "../common/logger";

let app: INestApplication | undefined;
afterEach(async () => { await app?.close(); app = undefined; });

async function startApp(login: { execute: ReturnType<typeof vi.fn> }) {
  const module = await Test.createTestingModule({ controllers: [PublicAuthController], providers: [
    { provide: LoginUseCase, useValue: login },
  ] }).compile();
  app = module.createNestApplication({ bodyParser: false }); configureHttpShell(app, new RecordingAuthLogger()); await app.listen(0, "127.0.0.1");
  const address = app.getHttpServer().address() as { port: number };
  return `http://127.0.0.1:${address.port}`;
}

const post = (url: string, body: unknown) => fetch(`${url}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("POST /auth/login", () => {
  it("answers 200 with the session tokens in a single round trip", async () => {
    const tokens = { accessToken: "access", refreshToken: "refresh", accessTokenExpiresInSeconds: 900, refreshTokenExpiresAt: "2026-10-03T12:00:00.000Z" };
    const login = { execute: vi.fn().mockResolvedValue(tokens) };
    const url = await startApp(login);

    const response = await post(url, { email: "admin@example.test", password: "Senha-Longa-123" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(tokens);
    expect(login.execute).toHaveBeenCalledWith({ email: "admin@example.test", password: "Senha-Longa-123", context: expect.any(Object) });
  });

  it("rejects the old secondFactor field and malformed payloads before the use case", async () => {
    const login = { execute: vi.fn() };
    const url = await startApp(login);

    for (const body of [{ email: "a@example.test", password: "x", secondFactor: "otp" }, { email: "", password: "x" }, { email: "a@example.test" }]) {
      expect((await post(url, body)).status).toBe(400);
    }
    expect(login.execute).not.toHaveBeenCalled();
  });

  it("answers an empty 401 for every refused login", async () => {
    const login = { execute: vi.fn().mockRejectedValue(new AuthenticationFailedError("unknown email")) };
    const url = await startApp(login);

    const response = await post(url, { email: "ninguem@example.test", password: "qualquer-coisa" });

    expect(response.status).toBe(401);
    expect(await response.text()).toBe("");
  });
});
