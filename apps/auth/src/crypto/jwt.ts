import { sign as cryptoSign, verify as cryptoVerify, type KeyObject } from "node:crypto";
import { decodeBase64Url, encodeBase64Url } from "./base64url";
import type { AuthenticationMethod, SigningKeyForSigning } from "../users/user";
import type { Permission } from "../rbac/permissions";

/**
 * Assinatura e verificacao de JWS compacto com EdDSA, direto do `node:crypto`.
 *
 * Escrito a mao — e nao com uma biblioteca — porque a superficie que usamos e
 * pequena e o unico ponto realmente perigoso do JWT esta em `verifyJwt`: aceitar
 * o `alg` que o **token** anuncia. Aqui o algoritmo e fixo em EdDSA e a chave e
 * escolhida por `kid` dentro do nosso proprio conjunto; um token que chegue
 * dizendo `alg: none` ou `alg: HS256` e recusado antes de qualquer verificacao.
 */
export const JWT_ALGORITHM = "EdDSA";

export interface JwtHeader {
  alg: string;
  typ: string;
  kid: string;
}

export interface AccessTokenClaims {
  iss: string;
  aud: string;
  sub: string;
  /** Sessao. Permite revogar um dispositivo sem derrubar os outros. */
  sid: string;
  jti: string;
  iat: number;
  exp: number;
  /** Permissoes efetivas ja resolvidas. */
  perms: Permission[];
  denies: Permission[];
  roles: string[];
  amr: AuthenticationMethod[];
  auth_time: number;
}

export type UnsignedAccessTokenClaims = Omit<AccessTokenClaims, "jti">;

export type SignAccessToken = (
  key: SigningKeyForSigning,
  claims: UnsignedAccessTokenClaims,
) => string;

export interface VerifyOptions {
  issuer: string;
  audience: string;
  /** Tolerancia para relogios dessincronizados entre maquinas. */
  clockToleranceSeconds?: number;
  now?: Date;
}

export function signJwt(
  claims: AccessTokenClaims,
  key: { kid: string; privateKey: KeyObject },
): string {
  const header: JwtHeader = { alg: JWT_ALGORITHM, typ: "at+jwt", kid: key.kid };
  const signingInput = `${encodeBase64Url(JSON.stringify(header))}.${encodeBase64Url(
    JSON.stringify(claims),
  )}`;
  const signature = cryptoSign(null, Buffer.from(signingInput), key.privateKey);
  return `${signingInput}.${signature.toString("base64url")}`;
}

export class InvalidTokenError extends Error {}

/**
 * `resolveKey` recebe o `kid` do header e devolve a chave publica — ou `null`,
 * que aqui significa "essa chave nao e nossa" e derruba o token. Injetado para
 * que a origem das chaves (banco, cache do JWKS) nao entre neste arquivo.
 */
export function verifyJwt(
  token: string,
  resolveKey: (kid: string) => KeyObject | null,
  options: VerifyOptions,
): AccessTokenClaims {
  const parts = token.split(".");
  if (parts.length !== 3) throw new InvalidTokenError("Malformed token");

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = parseJson<JwtHeader>(encodedHeader, "header");

  if (header.alg !== JWT_ALGORITHM) throw new InvalidTokenError("Unsupported token algorithm");
  if (header.typ !== "at+jwt") throw new InvalidTokenError("Unsupported token type");
  if (!header.kid) throw new InvalidTokenError("Token without key id");

  const publicKey = resolveKey(header.kid);
  if (!publicKey) throw new InvalidTokenError("Unknown signing key");

  const signatureOk = cryptoVerify(
    null,
    Buffer.from(`${encodedHeader}.${encodedPayload}`),
    publicKey,
    decodeBase64Url(encodedSignature),
  );
  if (!signatureOk) throw new InvalidTokenError("Bad token signature");

  const claims = parseJson<AccessTokenClaims>(encodedPayload, "payload");
  assertClaims(claims, options);
  return claims;
}

function assertClaims(claims: AccessTokenClaims, options: VerifyOptions): void {
  const tolerance = options.clockToleranceSeconds ?? 30;
  const nowInSeconds = Math.floor((options.now ?? new Date()).getTime() / 1000);

  if (claims.iss !== options.issuer) throw new InvalidTokenError("Unexpected token issuer");
  if (claims.aud !== options.audience) throw new InvalidTokenError("Unexpected token audience");
  if (typeof claims.exp !== "number" || claims.exp + tolerance < nowInSeconds) {
    throw new InvalidTokenError("Expired token");
  }
  if (typeof claims.iat === "number" && claims.iat - tolerance > nowInSeconds) {
    throw new InvalidTokenError("Token issued in the future");
  }
  if (!claims.sub) throw new InvalidTokenError("Token without subject");
  if (!Array.isArray(claims.denies) || !Number.isInteger(claims.auth_time)) {
    throw new InvalidTokenError("Invalid access token claims");
  }
  if ("ver" in claims) throw new InvalidTokenError("Unsupported access token claim");
}

function parseJson<T>(encoded: string, part: string): T {
  try {
    return JSON.parse(decodeBase64Url(encoded).toString("utf8")) as T;
  } catch {
    throw new InvalidTokenError(`Malformed token ${part}`);
  }
}
