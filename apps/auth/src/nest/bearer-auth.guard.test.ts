import type { ExecutionContext } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { AuthenticationFailedError } from "../common/errors";
import type { RuntimeEnv } from "../config/env";
import { generateSigningKey, privateKeyFromPem } from "../domain/crypto/signing-key";
import { BearerAuthGuard } from "./bearer-auth.guard";
import { signJwt, type AccessTokenClaims } from "../auth-core/security/jwt";
import type { SigningKeyService } from "../auth-core/security/signing-key.service";

const key = generateSigningKey();
const privateKey = privateKeyFromPem(key.privateKeyPem);
const env = { issuer: "https://auth.timeline.local", audience: "timeline-api" } as RuntimeEnv;
const keys = { publicKeyFor: async (kid: string) => (kid === key.kid ? key.publicJwk : null) } as unknown as SigningKeyService;

function tokenIssuedAt(issuedAt: Date): string {
  const iat = Math.floor(issuedAt.getTime() / 1000);
  const claims: AccessTokenClaims = {
    iss: env.issuer,
    aud: env.audience,
    sub: "user-1",
    sid: "session-1",
    jti: "token-1",
    iat,
    exp: iat + 900,
    perms: ["task:read"],
    denies: [],
    roles: ["member"],
    amr: ["pwd"],
    auth_time: iat,
  };
  return signJwt(claims, { kid: key.kid, privateKey });
}

function contextWith(token: string): ExecutionContext {
  const request = { header: (name: string) => (name === "authorization" ? `Bearer ${token}` : undefined) };
  return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
}

describe("BearerAuthGuard", () => {
  it("accepts a token still within its lifetime", async () => {
    const guard = new BearerAuthGuard(keys, env);

    await expect(guard.canActivate(contextWith(tokenIssuedAt(new Date())))).resolves.toBe(true);
  });

  // Um 401 é o que leva o cliente a renovar a sessão; um 500 a deixa presa até o login seguinte.
  it("refuses an expired token as an authentication failure, not an internal error", async () => {
    const guard = new BearerAuthGuard(keys, env);
    const anHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    await expect(guard.canActivate(contextWith(tokenIssuedAt(anHourAgo)))).rejects.toBeInstanceOf(AuthenticationFailedError);
  });

  it("refuses a token with a forged signature as an authentication failure", async () => {
    const guard = new BearerAuthGuard(keys, env);
    const [header, payload] = tokenIssuedAt(new Date()).split(".");

    await expect(guard.canActivate(contextWith(`${header}.${payload}.AAAA`))).rejects.toBeInstanceOf(AuthenticationFailedError);
  });
});
