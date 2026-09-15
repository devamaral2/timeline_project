import { Controller, Get, UseGuards, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { describe, expect, it } from "vitest";
import { AuthenticationFailedError, TokenKindNotAcceptedError } from "../common/errors";
import type { RuntimeEnv } from "../config/env";
import {
  buildUnsignedAccessTokenClaims,
  buildUnsignedGuestTokenClaims,
  buildUnsignedSignupTokenClaims,
  signJwt,
  type TokenClaims,
} from "../crypto/jwt";
import { generateSigningKey, privateKeyFromPem } from "../crypto/signing-key";
import type { SigningKeyService } from "../crypto/signing-key.service";
import { AcceptTokenKinds } from "./accept-token-kinds.decorator";
import { BearerAuthGuard, MissingTokenKindsError } from "./bearer-auth.guard";

const key = generateSigningKey();
const signer = { kid: key.kid, privateKey: privateKeyFromPem(key.privateKeyPem) };
const env = { issuer: "https://auth.example.test", audience: "timeline-api" } as RuntimeEnv;
const keys = { publicKeyFor: async (kid: string) => (kid === key.kid ? key.publicJwk : null) } as unknown as SigningKeyService;
const now = new Date();
const base = { iss: env.issuer, aud: env.audience, now };

const tokens = {
  user: signJwt({ ...buildUnsignedAccessTokenClaims({ ...base, sub: "u1", sid: "s1", perms: ["*:manage"], denies: [], roles: ["admin"] }), jti: "j-user" } as TokenClaims, signer),
  signup: signJwt({ ...buildUnsignedSignupTokenClaims({ ...base, sub: "p1" }), jti: "j-signup" } as TokenClaims, signer),
  guest: signJwt({ ...buildUnsignedGuestTokenClaims({ ...base, sub: "g1", subj: "u1", perms: ["event:read"] }), jti: "j-guest" } as TokenClaims, signer),
};

@Controller("fixture")
@UseGuards(BearerAuthGuard)
class FixtureController {
  @Get("undeclared") undeclared() { return "never"; }
  @Get("user") @AcceptTokenKinds("user") user() { return "ok"; }
  @Get("signup") @AcceptTokenKinds("signup") signup() { return "ok"; }
  @Get("guest-or-user") @AcceptTokenKinds("user", "guest") guestOrUser() { return "ok"; }
}

@Controller("declared-on-class")
@UseGuards(BearerAuthGuard)
@AcceptTokenKinds("user")
class ClassLevelController {
  @Get() inherited() { return "ok"; }
}

function contextFor(controller: new () => object, handler: string, authorization?: string) {
  const request: Record<string, unknown> = { header: (name: string) => (name === "authorization" ? authorization : undefined) };
  const context = {
    getClass: () => controller,
    getHandler: () => (controller.prototype as Record<string, unknown>)[handler],
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

const guard = new BearerAuthGuard(keys, env, new Reflector());

describe("BearerAuthGuard binds token kinds to routes", () => {
  it("fails closed on a route that declares no kinds, even with a valid user token", async () => {
    const { context } = contextFor(FixtureController, "undeclared", `Bearer ${tokens.user}`);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(MissingTokenKindsError);
    const anonymous = contextFor(FixtureController, "undeclared");
    await expect(guard.canActivate(anonymous.context)).rejects.toBeInstanceOf(MissingTokenKindsError);
  });

  it("builds the actor of the kind it accepted", async () => {
    const user = contextFor(FixtureController, "user", `Bearer ${tokens.user}`);
    await expect(guard.canActivate(user.context)).resolves.toBe(true);
    expect(user.request.actor).toEqual({ kind: "user", userId: "u1", sessionId: "s1", tokenId: "j-user", roles: ["admin"], permissions: ["*:manage"], denies: [] });

    const signup = contextFor(FixtureController, "signup", `Bearer ${tokens.signup}`);
    await expect(guard.canActivate(signup.context)).resolves.toBe(true);
    expect(signup.request.actor).toEqual({ kind: "signup", userId: "p1", tokenId: "j-signup" });

    const guest = contextFor(FixtureController, "guestOrUser", `Bearer ${tokens.guest}`);
    await expect(guard.canActivate(guest.context)).resolves.toBe(true);
    expect(guest.request.actor).toEqual({ kind: "guest", userId: "g1", observedUserId: "u1", tokenId: "j-guest", permissions: ["event:read"] });
  });

  it("rejects a valid token of the wrong kind with a typed rejection, not an incidental 401", async () => {
    for (const [handler, token, kind] of [
      ["user", tokens.signup, "signup"],
      ["user", tokens.guest, "guest"],
      ["signup", tokens.user, "user"],
      ["signup", tokens.guest, "guest"],
      ["guestOrUser", tokens.signup, "signup"],
    ] as const) {
      const { context, request } = contextFor(FixtureController, handler, `Bearer ${token}`);
      const rejection = guard.canActivate(context);
      await expect(rejection).rejects.toBeInstanceOf(TokenKindNotAcceptedError);
      await expect(rejection).rejects.toMatchObject({ tokenKind: kind });
      expect(request.actor).toBeUndefined();
    }
  });

  it("reads the declaration from the controller when the handler has none", async () => {
    await expect(guard.canActivate(contextFor(ClassLevelController, "inherited", `Bearer ${tokens.user}`).context)).resolves.toBe(true);
    await expect(guard.canActivate(contextFor(ClassLevelController, "inherited", `Bearer ${tokens.signup}`).context)).rejects.toBeInstanceOf(TokenKindNotAcceptedError);
  });

  it("keeps a missing or tampered bearer as an authentication failure", async () => {
    await expect(guard.canActivate(contextFor(FixtureController, "user").context)).rejects.toBeInstanceOf(AuthenticationFailedError);
    const tampered = `${tokens.user.slice(0, -4)}AAAA`;
    await expect(guard.canActivate(contextFor(FixtureController, "user", `Bearer ${tampered}`).context)).rejects.toBeInstanceOf(AuthenticationFailedError);
  });
});
