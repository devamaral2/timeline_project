export interface PublicSigningJwk {
  kty: "OKP";
  crv: "Ed25519";
  x: string;
  kid: string;
  use: "sig";
  alg: "EdDSA";
}

export function isPublicSigningJwk(value: unknown): value is PublicSigningJwk {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const jwk = value as Record<string, unknown>;
  return (
    jwk.kty === "OKP" &&
    jwk.crv === "Ed25519" &&
    typeof jwk.x === "string" &&
    jwk.x.length > 0 &&
    typeof jwk.kid === "string" &&
    jwk.kid.length > 0 &&
    jwk.use === "sig" &&
    jwk.alg === "EdDSA" &&
    !("d" in jwk)
  );
}
