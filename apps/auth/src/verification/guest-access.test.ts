import { describe, expect, it } from "vitest";
import { buildUnsignedAccessTokenClaims, buildUnsignedGuestTokenClaims, buildUnsignedSignupTokenClaims, signJwt, type ClaimsOf, type TokenClaims } from "../crypto/jwt";
import { generateSigningKey, privateKeyFromPem } from "../crypto/signing-key";
import { authorizeGuestRead, checkToken } from "./guest-access";

const now = new Date();
const base = { iss: "https://auth.example.test", aud: "timeline-api", now };
const claims: ClaimsOf<"guest"> = { ...buildUnsignedGuestTokenClaims({ ...base, sub: "guest-1", subj: "owner-1", perms: ["event:read", "tag:read"] }), jti: "jti-1" };
const allowedRead = { claims, method: "GET", resourceOwnerUserId: "owner-1", currentObservesUserId: "owner-1" };

describe("authorizeGuestRead — the consumer contract", () => {
  it("allows a read of the observed user's data", () => {
    expect(authorizeGuestRead(allowedRead)).toEqual({ allowed: true });
    expect(authorizeGuestRead({ ...allowedRead, method: "head" })).toEqual({ allowed: true });
  });

  it.each(["POST", "PUT", "PATCH", "DELETE", "CUSTOM"])("refuses %s — read-only by method, so new write routes are closed by default", (method) => {
    expect(authorizeGuestRead({ ...allowedRead, method })).toEqual({ allowed: false, reason: "method_not_read" });
  });

  it("refuses data owned by anyone but subj", () => {
    expect(authorizeGuestRead({ ...allowedRead, resourceOwnerUserId: "someone-else" })).toEqual({ allowed: false, reason: "subject_mismatch" });
  });

  it("trusts users.observes_user_id over the claim: a deleted guest is revoked at once, a rebound one is refused", () => {
    expect(authorizeGuestRead({ ...allowedRead, currentObservesUserId: null })).toEqual({ allowed: false, reason: "guest_revoked" });
    expect(authorizeGuestRead({ ...allowedRead, currentObservesUserId: "owner-2", resourceOwnerUserId: "owner-2" })).toEqual({ allowed: false, reason: "guest_rebound" });
  });

  it("consults a jti deny-list only when one is supplied", () => {
    expect(authorizeGuestRead({ ...allowedRead, isJtiRevoked: (jti) => jti === "jti-1" })).toEqual({ allowed: false, reason: "jti_revoked" });
    expect(authorizeGuestRead({ ...allowedRead, isJtiRevoked: () => false })).toEqual({ allowed: true });
  });
});

describe("checkToken — rule 1 against a cached JWKS", () => {
  const key = generateSigningKey();
  const signer = { kid: key.kid, privateKey: privateKeyFromPem(key.privateKeyPem) };
  const sign = (unsigned: object) => signJwt({ ...unsigned, jti: "j" } as TokenClaims, signer);
  const expected = { issuer: base.iss, audience: base.aud };
  const guest = sign(buildUnsignedGuestTokenClaims({ ...base, sub: "g", subj: "o", perms: ["event:read"] }));
  const user = sign(buildUnsignedAccessTokenClaims({ ...base, sub: "u", sid: "s", perms: [], denies: [], roles: [] }));
  const signup = sign(buildUnsignedSignupTokenClaims({ ...base, sub: "p" }));

  it("accepts only the kinds the route declares", () => {
    expect(checkToken(guest, [key.publicJwk], { ...expected, accepted: ["guest"] })).toMatchObject({ ok: true, claims: { subj: "o" } });
    expect(checkToken(guest, [key.publicJwk], { ...expected, accepted: ["user"] })).toEqual({ ok: false, reason: "Token kind not accepted" });
    expect(checkToken(signup, [key.publicJwk], { ...expected, accepted: ["user", "guest"] })).toMatchObject({ ok: false });
    expect(checkToken(user, [key.publicJwk], { ...expected, accepted: ["user"] })).toMatchObject({ ok: true });
  });

  it("reports an expired guest token instead of throwing", () => {
    const later = new Date(now.getTime() + (3600 + 31) * 1000);
    expect(checkToken(guest, [key.publicJwk], { ...expected, accepted: ["guest"] }, later)).toEqual({ ok: false, reason: "Invalid token lifetime" });
  });
});
