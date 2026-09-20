import { createPrivateKey, createPublicKey, generateKeyPairSync, randomUUID } from "node:crypto";
import type { KeyObject } from "node:crypto";
import type { PublicSigningJwk } from "./jwk";

/**
 * Ed25519 (`EdDSA` no JOSE), e nao RSA: assinatura de 64 bytes, verificacao na
 * casa das dezenas de microssegundos e nenhum parametro para errar — nao existe
 * "Ed25519 com expoente fraco". Como cada servico verifica o token localmente,
 * o custo de verificacao entra em *todo* request: e o numero que importa.
 *
 * A chave privada nunca sai do auth. Os outros servicos so veem a publica, pelo
 * JWKS.
 */
export interface SigningKeyMaterial {
  kid: string;
  privateKeyPem: string;
  publicJwk: PublicSigningJwk;
}

export function generateSigningKey(): SigningKeyMaterial {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const kid = randomUUID();

  return {
    kid,
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicJwk: toPublicJwk(publicKey, kid),
  };
}

export function toPublicJwk(publicKey: KeyObject, kid: string): PublicSigningJwk {
  const { kty, crv, x } = publicKey.export({ format: "jwk" });
  if (kty !== "OKP" || crv !== "Ed25519" || typeof x !== "string" || !isEd25519PublicX(x)) {
    throw new TypeError("Expected an Ed25519 public JWK");
  }
  return {
    kty,
    crv,
    x,
    kid,
    alg: "EdDSA",
    use: "sig",
  };
}

function isEd25519PublicX(value: string): boolean {
  return value.length === 43 && /^[A-Za-z0-9_-]+$/.test(value);
}

export function privateKeyFromPem(pem: string): KeyObject {
  return createPrivateKey(pem);
}

export function publicKeyFromJwk(jwk: PublicSigningJwk): KeyObject {
  return createPublicKey({ key: jwk as never, format: "jwk" });
}
