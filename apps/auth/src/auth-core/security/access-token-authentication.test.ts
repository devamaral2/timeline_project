import { describe, expect, it } from "vitest";
import { AuthenticationFailedError } from "../../common/errors";
import { generateSigningKey, privateKeyFromPem } from "../../domain/crypto/signing-key";
import { authenticateAccessToken, authenticateBearer, type BearerAuthenticationDependencies } from "./access-token-authentication";
import { signJwt, type AccessTokenClaims } from "./jwt";

const key = generateSigningKey();
const privateKey = privateKeyFromPem(key.privateKeyPem);
const issuer = "https://auth.timeline.local";
const audience = "timeline-api";

const dependencies: BearerAuthenticationDependencies = {
  keys: { publicKeyFor: async (kid) => (kid === key.kid ? key.publicJwk : null) },
  issuer,
  audience,
  now: () => new Date(),
};

function tokenIssuedAt(issuedAt: Date, overrides: Partial<AccessTokenClaims> = {}): string {
  const iat = Math.floor(issuedAt.getTime() / 1000);
  const claims: AccessTokenClaims = {
    iss: issuer,
    aud: audience,
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
    ...overrides,
  };
  return signJwt(claims, { kid: key.kid, privateKey });
}

describe("access token authentication", () => {
  it("turns a valid token into the authenticated actor", async () => {
    const issuedAt = new Date();
    const actor = await authenticateAccessToken(tokenIssuedAt(issuedAt), dependencies);

    expect(actor).toEqual({
      userId: "user-1",
      sessionId: "session-1",
      roles: ["member"],
      permissions: ["task:read"],
      denies: [],
      amr: ["pwd"],
      authTime: Math.floor(issuedAt.getTime() / 1000),
    });
  });

  // Um 401 é o que leva o cliente a renovar a sessão; um 500 a deixa presa até o login seguinte.
  it("refuses an expired token as an authentication failure, not an internal error", async () => {
    const anHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    await expect(authenticateAccessToken(tokenIssuedAt(anHourAgo), dependencies)).rejects.toBeInstanceOf(
      AuthenticationFailedError,
    );
  });

  it("refuses a token with a forged signature as an authentication failure", async () => {
    const [header, payload] = tokenIssuedAt(new Date()).split(".");

    await expect(authenticateAccessToken(`${header}.${payload}.AAAA`, dependencies)).rejects.toBeInstanceOf(
      AuthenticationFailedError,
    );
  });

  it("refuses a malformed token without leaking the parsing error", async () => {
    const failure = authenticateAccessToken("not-a-jwt", dependencies);
    await expect(failure).rejects.toBeInstanceOf(AuthenticationFailedError);
    await expect(failure).rejects.toMatchObject({ internalReason: "malformed bearer" });
  });

  it("refuses a token whose key is unknown", async () => {
    const other = generateSigningKey();
    const foreign = signJwt(
      {
        iss: issuer,
        aud: audience,
        sub: "user-2",
        sid: "session-2",
        jti: "token-2",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 900,
        perms: [],
        denies: [],
        roles: [],
        amr: ["pwd"],
        auth_time: Math.floor(Date.now() / 1000),
      },
      { kid: other.kid, privateKey: privateKeyFromPem(other.privateKeyPem) },
    );

    const failure = authenticateAccessToken(foreign, dependencies);
    await expect(failure).rejects.toBeInstanceOf(AuthenticationFailedError);
    await expect(failure).rejects.toMatchObject({ internalReason: "unknown kid" });
  });
});

describe("bearer authentication from a request", () => {
  const requestWith = (authorization: string | undefined) => ({
    header: (name: string) => (name === "authorization" ? authorization : undefined),
  });

  it("authenticates the bearer token carried by the request", async () => {
    const actor = await authenticateBearer(requestWith(`Bearer ${tokenIssuedAt(new Date())}`), dependencies);

    expect(actor.userId).toBe("user-1");
  });

  it.each([
    ["no authorization header", undefined, "missing bearer"],
    ["another scheme", "Basic dXNlcjpwYXNz", "missing bearer"],
    ["an empty bearer", "Bearer ", "missing bearer"],
  ])("refuses %s", async (_label, authorization, reason) => {
    const failure = authenticateBearer(requestWith(authorization), dependencies);
    await expect(failure).rejects.toBeInstanceOf(AuthenticationFailedError);
    await expect(failure).rejects.toMatchObject({ internalReason: reason });
  });
});
