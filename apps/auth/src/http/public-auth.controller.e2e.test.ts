import { afterEach, describe, expect, it, vi } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { PublicAuthController } from "./public-auth.controller";
import { InspectInviteUseCase } from "../invites/usecases/inspect-invite.usecase";
import { StartInviteAcceptanceUseCase } from "../authentication/usecases/start-invite-acceptance.usecase";
import { StartLoginUseCase } from "../authentication/usecases/start-login.usecase";
import { VerifyMfaUseCase } from "../authentication/usecases/verify-mfa.usecase";
import { CompleteLoginUseCase } from "../authentication/usecases/complete-login.usecase";
import { ResendMfaUseCase } from "../authentication/usecases/resend-mfa.usecase";
import { configureHttpShell } from "./request-context.middleware";

let app: INestApplication | undefined;
afterEach(async () => { await app?.close(); app = undefined; });

async function startApp(verify: { execute: ReturnType<typeof vi.fn> }) {
  const module = await Test.createTestingModule({ controllers: [PublicAuthController], providers: [
    { provide: InspectInviteUseCase, useValue: { execute: vi.fn() } },
    { provide: StartInviteAcceptanceUseCase, useValue: { execute: vi.fn() } },
    { provide: StartLoginUseCase, useValue: { execute: vi.fn() } },
    { provide: VerifyMfaUseCase, useValue: verify },
    { provide: CompleteLoginUseCase, useValue: { recover: vi.fn(), verifyOtp: vi.fn() } },
    { provide: ResendMfaUseCase, useValue: { execute: vi.fn() } },
  ] }).compile();
  app = module.createNestApplication({ bodyParser: false }); configureHttpShell(app); await app.listen(0, "127.0.0.1");
  const address = app.getHttpServer().address() as { port: number };
  return `http://127.0.0.1:${address.port}`;
}

describe("POST /auth/mfa/verify", () => {
  it("accepts only the public MFA shape and returns the one-time enrollment response", async () => {
    const verify = { execute: vi.fn().mockResolvedValue({ accessToken: "access", refreshToken: "refresh", accessTokenExpiresInSeconds: 900, refreshTokenExpiresAt: "2026-10-03T12:00:00.000Z", recoveryCodes: Array.from({ length: 10 }, () => "AAAA-BBBB-CCCC-DDDD") }) };
    const url = await startApp(verify);
    const response = await fetch(`${url}/auth/mfa/verify`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mfaToken: "opaque", code: "000000" }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ accessToken: "access", recoveryCodes: expect.arrayContaining(["AAAA-BBBB-CCCC-DDDD"]) });
    expect(verify.execute).toHaveBeenCalledWith(expect.objectContaining({ mfaToken: "opaque", code: "000000", context: expect.any(Object) }));
  });

  it("rejects malformed payloads before the use case", async () => {
    const verify = { execute: vi.fn() };
    const url = await startApp(verify);
    const response = await fetch(`${url}/auth/mfa/verify`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mfaToken: "", code: "000000" }) });
    expect(response.status).toBe(400);
    expect(verify.execute).not.toHaveBeenCalled();
  });
});
