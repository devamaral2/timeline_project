import { afterEach, describe, expect, it, vi } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { PublicAuthController } from "./public-auth.controller";
import { InspectInviteUseCase } from "../invites/usecases/inspect-invite.usecase";
import { StartInviteAcceptanceUseCase } from "../authentication/usecases/start-invite-acceptance.usecase";
import { CompleteInviteAcceptanceUseCase } from "../authentication/usecases/complete-invite-acceptance.usecase";
import { configureHttpShell } from "./request-context.middleware";

let app: INestApplication | undefined;
afterEach(async () => { await app?.close(); app = undefined; });

describe("POST /auth/mfa/verify", () => {
  it("accepts only the public MFA shape and returns the one-time enrollment response", async () => {
    const complete = { execute: vi.fn().mockResolvedValue({ accessToken: "access", refreshToken: "refresh", accessTokenExpiresInSeconds: 900, refreshTokenExpiresAt: "2026-10-03T12:00:00.000Z", recoveryCodes: Array.from({ length: 10 }, () => "AAAA-BBBB-CCCC-DDDD") }) };
    const module = await Test.createTestingModule({ controllers: [PublicAuthController], providers: [
      { provide: InspectInviteUseCase, useValue: { execute: vi.fn() } },
      { provide: StartInviteAcceptanceUseCase, useValue: { execute: vi.fn() } },
      { provide: CompleteInviteAcceptanceUseCase, useValue: complete },
    ] }).compile();
    app = module.createNestApplication({ bodyParser: false }); configureHttpShell(app); await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address() as { port: number };
    const response = await fetch(`http://127.0.0.1:${address.port}/auth/mfa/verify`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mfaToken: "opaque", code: "000000" }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ accessToken: "access", recoveryCodes: expect.arrayContaining(["AAAA-BBBB-CCCC-DDDD"]) });
    expect(complete.execute).toHaveBeenCalledWith(expect.objectContaining({ mfaToken: "opaque", code: "000000", context: expect.any(Object) }));
  });

  it("rejects malformed payloads before the use case", async () => {
    const complete = { execute: vi.fn() };
    const module = await Test.createTestingModule({ controllers: [PublicAuthController], providers: [
      { provide: InspectInviteUseCase, useValue: { execute: vi.fn() } }, { provide: StartInviteAcceptanceUseCase, useValue: { execute: vi.fn() } }, { provide: CompleteInviteAcceptanceUseCase, useValue: complete },
    ] }).compile();
    app = module.createNestApplication({ bodyParser: false }); configureHttpShell(app); await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address() as { port: number };
    const response = await fetch(`http://127.0.0.1:${address.port}/auth/mfa/verify`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mfaToken: "", code: "000000" }) });
    expect(response.status).toBe(400);
    expect(complete.execute).not.toHaveBeenCalled();
  });
});
