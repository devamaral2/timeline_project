import {
  sign as cryptoSign,
  verify as cryptoVerify,
  type KeyObject,
} from 'node:crypto';
import { SECURITY_POLICY } from '../config/security-policy';
import type { AuthenticationMethod, SigningKeyForSigning } from '../users/user';
import { isPermission, type Permission } from '../rbac/permissions';
import { decodeBase64Url, encodeBase64Url } from './base64url';
import type { PublicSigningJwk } from './jwk';
import { publicKeyFromJwk } from './signing-key';

export const JWT_ALGORITHM = 'EdDSA';
const HEADER_KEYS = ['alg', 'typ', 'kid'] as const;
const CLAIM_KEYS = [
  'iss',
  'aud',
  'sub',
  'sid',
  'jti',
  'iat',
  'exp',
  'perms',
  'denies',
  'roles',
  'amr',
  'auth_time',
] as const;
export interface AccessTokenClaims {
  iss: string;
  aud: string;
  sub: string;
  sid: string;
  jti: string;
  iat: number;
  exp: number;
  perms: Permission[];
  denies: Permission[];
  roles: string[];
  amr: AuthenticationMethod[];
  auth_time: number;
}
export type UnsignedAccessTokenClaims = Omit<AccessTokenClaims, 'jti'>;
export type SignAccessToken = (
  key: SigningKeyForSigning,
  claims: UnsignedAccessTokenClaims,
) => string;
export class InvalidTokenError extends Error {}

export function buildUnsignedAccessTokenClaims(
  input: Omit<UnsignedAccessTokenClaims, 'iat' | 'exp'> & { now: Date },
): UnsignedAccessTokenClaims {
  const iat = Math.floor(input.now.getTime() / 1000);
  return { ...input, iat, exp: iat + SECURITY_POLICY.accessTokenTtlSeconds };
}
export function signJwt(
  claims: AccessTokenClaims,
  key: { kid: string; privateKey: KeyObject },
): string {
  const header = { alg: JWT_ALGORITHM, typ: 'at+jwt', kid: key.kid };
  const signingInput = `${encodeBase64Url(JSON.stringify(header))}.${encodeBase64Url(JSON.stringify(claims))}`;
  return `${signingInput}.${cryptoSign(null, Buffer.from(signingInput), key.privateKey).toString('base64url')}`;
}
export function verifyJwt(
  token: string,
  keys: readonly PublicSigningJwk[],
  expectedIssuer: string,
  expectedAudience: string,
  now: Date,
): AccessTokenClaims {
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((part) => !part))
    invalid('Malformed token');
  const [headerText, payloadText, signatureText] = parts as [
    string,
    string,
    string,
  ];
  const header = parseObject(headerText, 'header');
  exactKeys(header, HEADER_KEYS, 'header');
  if (
    header.alg !== JWT_ALGORITHM ||
    header.typ !== 'at+jwt' ||
    !nonEmpty(header.kid)
  )
    invalid('Invalid token header');
  const jwk = keys.find((key) => key.kid === header.kid);
  if (!jwk) invalid('Unknown signing key');
  let verified: boolean;
  try {
    verified = cryptoVerify(
      null,
      Buffer.from(`${headerText}.${payloadText}`),
      publicKeyFromJwk(jwk),
      decodeBase64Url(signatureText),
    );
  } catch {
    invalid('Invalid signature');
  }
  if (!verified!) invalid('Invalid signature');
  const claims = parseObject(payloadText, 'payload');
  exactKeys(claims, CLAIM_KEYS, 'payload');
  assertClaims(claims, expectedIssuer, expectedAudience, now);
  return claims as unknown as AccessTokenClaims;
}
function assertClaims(
  value: Record<string, unknown>,
  issuer: string,
  audience: string,
  now: Date,
): void {
  for (const field of ['iss', 'aud', 'sub', 'sid', 'jti'] as const)
    if (!nonEmpty(value[field])) invalid('Invalid string claim');
  if (value.iss !== issuer || value.aud !== audience)
    invalid('Unexpected issuer or audience');
  for (const field of ['iat', 'exp', 'auth_time'] as const)
    if (!Number.isInteger(value[field])) invalid('Invalid NumericDate');
  const iat = value.iat as number,
    exp = value.exp as number,
    authTime = value.auth_time as number,
    current = Math.floor(now.getTime() / 1000),
    tolerance = SECURITY_POLICY.clockToleranceSeconds;
  if (
    exp - iat !== SECURITY_POLICY.accessTokenTtlSeconds ||
    exp <= iat ||
    exp + tolerance < current ||
    iat - tolerance > current ||
    authTime - tolerance > current
  )
    invalid('Invalid token lifetime');
  if (
    !permissionList(value.perms) ||
    !permissionList(value.denies) ||
    !uniqueStrings(value.roles) ||
    !uniqueMethods(value.amr)
  )
    invalid('Invalid access token claims');
}
function parseObject(encoded: string, part: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(
      decodeBase64Url(encoded).toString('utf8'),
    );
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      invalid(`Malformed token ${part}`);
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof InvalidTokenError) throw error;
    invalid(`Malformed token ${part}`);
  }
}
function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  part: string,
): void {
  if (
    Object.keys(value).length !== allowed.length ||
    Object.keys(value).some((key) => !allowed.includes(key))
  )
    invalid(`Unexpected ${part} claim`);
}
function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
function permissionList(value: unknown): value is Permission[] {
  return Array.isArray(value) && value.every(isPermission);
}
function uniqueStrings(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every(nonEmpty) &&
    new Set(value).size === value.length
  );
}
function uniqueMethods(value: unknown): value is AuthenticationMethod[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) => item === 'pwd' || item === 'otp' || item === 'recovery',
    ) &&
    new Set(value).size === value.length
  );
}
function invalid(message: string): never {
  throw new InvalidTokenError(message);
}
