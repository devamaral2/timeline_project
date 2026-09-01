import { describe, expect, it } from "vitest";
import { createPublicKey } from "node:crypto";
import { encodeBase64Url } from "./base64url";
import { InvalidTokenError, signJwt, verifyJwt, type AccessTokenClaims } from "./jwt";
import {
  generateSigningKey,
  privateKeyFromPem,
  publicKeyFromJwk,
  toPublicJwk,
} from "./signing-key";

const key = generateSigningKey();
const privateKey = privateKeyFromPem(key.privateKeyPem);
const publicKey = publicKeyFromJwk(key.publicJwk);
const resolveKey = (kid: string) => (kid === key.kid ? publicKey : null);

const NOW = new Date("2026-08-30T12:00:00Z");

function claimsAt(overrides: Partial<AccessTokenClaims> = {}): AccessTokenClaims {
  const issuedAt = Math.floor(NOW.getTime() / 1000);
  return {
    iss: "https://auth.timeline.local",
    aud: "timeline-api",
    sub: "user-1",
    sid: "session-1",
    jti: "token-1",
    iat: issuedAt,
    exp: issuedAt + 900,
    perms: ["event:read"],
    denies: [],
    roles: ["member"],
    amr: ["pwd", "otp"],
    auth_time: issuedAt,
    ...overrides,
  };
}

const options = { issuer: "https://auth.timeline.local", audience: "timeline-api", now: NOW };

describe("jwt", () => {
  it("devolve as claims de um token que ele mesmo assinou", () => {
    const token = signJwt(claimsAt(), { kid: key.kid, privateKey });

    expect(verifyJwt(token, resolveKey, options)).toEqual(claimsAt());
  });

  it("emite access token com typ at+jwt e as claims de autorizacao aprovadas", () => {
    const token = signJwt(claimsAt(), { kid: key.kid, privateKey });
    const [encodedHeader, encodedPayload] = token.split(".");

    expect(JSON.parse(Buffer.from(encodedHeader!, "base64url").toString("utf8"))).toMatchObject({
      alg: "EdDSA",
      typ: "at+jwt",
    });
    expect(JSON.parse(Buffer.from(encodedPayload!, "base64url").toString("utf8"))).toMatchObject({
      denies: [],
      auth_time: Math.floor(NOW.getTime() / 1000),
    });
  });

  it("recusa access token que ainda traz a claim ver removida", () => {
    const token = signJwt({ ...claimsAt(), ver: 1 } as AccessTokenClaims, {
      kid: key.kid,
      privateKey,
    });

    expect(() => verifyJwt(token, resolveKey, options)).toThrow(/claim|payload|access/i);
  });

  it("recusa token assinado por outra chave", () => {
    const other = generateSigningKey();
    const token = signJwt(claimsAt(), {
      kid: key.kid,
      privateKey: privateKeyFromPem(other.privateKeyPem),
    });

    expect(() => verifyJwt(token, resolveKey, options)).toThrow(/signature/i);
  });

  it("recusa kid desconhecido antes de verificar assinatura", () => {
    const token = signJwt(claimsAt(), { kid: "kid-de-outro-emissor", privateKey });

    expect(() => verifyJwt(token, resolveKey, options)).toThrow(InvalidTokenError);
  });

  // O ataque classico do JWT: trocar o header por `alg: none` e apagar a
  // assinatura. O algoritmo nunca vem do token.
  it("recusa alg none mesmo com payload valido", () => {
    const header = encodeBase64Url(JSON.stringify({ alg: "none", typ: "JWT", kid: key.kid }));
    const payload = encodeBase64Url(JSON.stringify(claimsAt()));

    expect(() => verifyJwt(`${header}.${payload}.`, resolveKey, options)).toThrow(/algorithm/i);
  });

  it("recusa token expirado alem da tolerancia de relogio", () => {
    const token = signJwt(claimsAt(), { kid: key.kid, privateKey });
    const later = new Date(NOW.getTime() + 901_000 + 31_000);

    expect(() => verifyJwt(token, resolveKey, { ...options, now: later })).toThrow(/expired/i);
  });

  it("aceita token recem-expirado dentro da tolerancia", () => {
    const token = signJwt(claimsAt(), { kid: key.kid, privateKey });
    const later = new Date(NOW.getTime() + 900_000 + 10_000);

    expect(verifyJwt(token, resolveKey, { ...options, now: later }).sub).toBe("user-1");
  });

  it("recusa token emitido para outra audiencia", () => {
    const token = signJwt(claimsAt({ aud: "outro-servico" }), { kid: key.kid, privateKey });

    expect(() => verifyJwt(token, resolveKey, options)).toThrow(/audience/i);
  });

  it("recusa token de outro emissor", () => {
    const token = signJwt(claimsAt({ iss: "https://evil.example" }), { kid: key.kid, privateKey });

    expect(() => verifyJwt(token, resolveKey, options)).toThrow(/issuer/i);
  });

  it("exporta a chave publica em JWK que o node reimporta", () => {
    expect(key.publicJwk).toMatchObject({ kty: "OKP", crv: "Ed25519", alg: "EdDSA", use: "sig" });
    expect(createPublicKey({ key: key.publicJwk as never, format: "jwk" }).type).toBe("public");
  });

  it("recusa export JWK que nao e uma chave publica Ed25519", () => {
    const malformedKey = {
      export: () => ({ kty: "EC", crv: "P-256", x: "not-an-ed25519-key" }),
    };

    expect(() => toPublicJwk(malformedKey as never, "kid-test")).toThrow(/Ed25519/i);
  });
});
