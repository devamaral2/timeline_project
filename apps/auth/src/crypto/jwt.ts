import {
  sign as cryptoSign,
  verify as cryptoVerify,
  type KeyObject,
} from 'node:crypto';
import { SECURITY_POLICY } from '../config/security-policy';
import type { SigningKeyForSigning } from '../users/user';
import { isPermission, type Permission } from '../rbac/permissions';
import { decodeBase64Url, encodeBase64Url } from './base64url';
import type { PublicSigningJwk } from './jwk';
import { publicKeyFromJwk } from './signing-key';

export const JWT_ALGORITHM = 'EdDSA';
const HEADER_KEYS = ['alg', 'typ', 'kid'] as const;

/**
 * O discriminador de tipo vive na claim `token_use` do payload, nunca no `typ`
 * do header JOSE. O header tambem muda por tipo (`at+jwt`, `signup+jwt`,
 * `guest+jwt`), mas e so uma segunda camada: quem decide o que o token pode
 * fazer e `token_use`, lido antes de qualquer outra claim.
 */
export const TOKEN_USES = ['user', 'signup', 'guest'] as const;
export type TokenUse = (typeof TOKEN_USES)[number];

export interface UserTokenClaims {
  iss: string;
  aud: string;
  sub: string;
  sid: string;
  jti: string;
  iat: number;
  exp: number;
  token_use: 'user';
  perms: Permission[];
  denies: Permission[];
  roles: string[];
}
/** `sub` e a linha `pending_sign_up`. Sem sessao e sem permissao: o gate da
 *  rota de signup e o proprio tipo mais o status da linha. */
export interface SignupTokenClaims {
  iss: string;
  aud: string;
  sub: string;
  jti: string;
  iat: number;
  exp: number;
  token_use: 'signup';
}
/** `sub` e a linha do proprio guest; `subj` e o usuario observado. `subj` e
 *  cache: a fonte de verdade e `users.observes_user_id`. */
export interface GuestTokenClaims {
  iss: string;
  aud: string;
  sub: string;
  subj: string;
  jti: string;
  iat: number;
  exp: number;
  token_use: 'guest';
  perms: Permission[];
}
export type TokenClaims = UserTokenClaims | SignupTokenClaims | GuestTokenClaims;
export type ClaimsOf<K extends TokenUse> = Extract<TokenClaims, { token_use: K }>;
/** Mantido com o nome antigo: e o unico tipo que abre sessao. */
export type AccessTokenClaims = UserTokenClaims;

type Unsigned<T> = T extends TokenClaims ? Omit<T, 'jti'> : never;
export type UnsignedTokenClaims = Unsigned<TokenClaims>;
export type UnsignedAccessTokenClaims = Omit<UserTokenClaims, 'jti'>;
/**
 * O callback que sessao e login recebem para assinar um token de usuario.
 * Continua estreito de proposito: quem precisa do `jti` (signup, guest) chama
 * `SigningKeyService.mintToken`, que devolve os dois.
 */
export type SignAccessToken = (
  key: SigningKeyForSigning,
  claims: UnsignedAccessTokenClaims,
) => string;
export class InvalidTokenError extends Error {}

interface TokenKindRule {
  headerTyp: string;
  allowedKeys: readonly string[];
  ttlSeconds: number;
  requiredStrings: readonly string[];
  checkClaims(value: Record<string, unknown>): boolean;
}

/**
 * Uma regra por tipo. `allowedKeys` e comparado por igualdade exata (nem uma
 * claim a mais, nem uma a menos) por tipo: relaxar para "superconjunto
 * permitido" reabriria contrabando de claim — um token de usuario carregando
 * `subj`, por exemplo.
 */
const TOKEN_KIND_RULES: Readonly<Record<TokenUse, TokenKindRule>> = {
  user: {
    headerTyp: 'at+jwt',
    allowedKeys: ['iss', 'aud', 'sub', 'sid', 'jti', 'iat', 'exp', 'token_use', 'perms', 'denies', 'roles'],
    ttlSeconds: SECURITY_POLICY.accessTokenTtlSeconds,
    requiredStrings: ['iss', 'aud', 'sub', 'sid', 'jti'],
    checkClaims: (value) =>
      permissionList(value.perms) &&
      permissionList(value.denies) &&
      uniqueStrings(value.roles),
  },
  signup: {
    headerTyp: 'signup+jwt',
    allowedKeys: ['iss', 'aud', 'sub', 'jti', 'iat', 'exp', 'token_use'],
    ttlSeconds: SECURITY_POLICY.signupTokenTtlSeconds,
    requiredStrings: ['iss', 'aud', 'sub', 'jti'],
    checkClaims: () => true,
  },
  guest: {
    headerTyp: 'guest+jwt',
    allowedKeys: ['iss', 'aud', 'sub', 'subj', 'jti', 'iat', 'exp', 'token_use', 'perms'],
    ttlSeconds: SECURITY_POLICY.guestTokenTtlSeconds,
    requiredStrings: ['iss', 'aud', 'sub', 'subj', 'jti'],
    checkClaims: (value) => permissionList(value.perms) && value.sub !== value.subj,
  },
};

export function tokenTtlSeconds(kind: TokenUse): number {
  return TOKEN_KIND_RULES[kind].ttlSeconds;
}

function issuedWindow(now: Date, kind: TokenUse): { iat: number; exp: number } {
  const iat = Math.floor(now.getTime() / 1000);
  return { iat, exp: iat + TOKEN_KIND_RULES[kind].ttlSeconds };
}

export function buildUnsignedAccessTokenClaims(
  input: Omit<UnsignedAccessTokenClaims, 'iat' | 'exp' | 'token_use'> & { now: Date },
): UnsignedAccessTokenClaims {
  const { now, ...claims } = input;
  return { ...claims, token_use: 'user', ...issuedWindow(now, 'user') };
}
export function buildUnsignedSignupTokenClaims(
  input: Omit<SignupTokenClaims, 'jti' | 'iat' | 'exp' | 'token_use'> & { now: Date },
): Omit<SignupTokenClaims, 'jti'> {
  const { now, ...claims } = input;
  return { ...claims, token_use: 'signup', ...issuedWindow(now, 'signup') };
}
export function buildUnsignedGuestTokenClaims(
  input: Omit<GuestTokenClaims, 'jti' | 'iat' | 'exp' | 'token_use'> & { now: Date },
): Omit<GuestTokenClaims, 'jti'> {
  const { now, ...claims } = input;
  return { ...claims, token_use: 'guest', ...issuedWindow(now, 'guest') };
}

export function signJwt(
  claims: TokenClaims,
  key: { kid: string; privateKey: KeyObject },
): string {
  const rule = TOKEN_KIND_RULES[claims.token_use];
  if (!rule) throw new TypeError('Unknown token_use');
  const header = { alg: JWT_ALGORITHM, typ: rule.headerTyp, kid: key.kid };
  const signingInput = `${encodeBase64Url(JSON.stringify(header))}.${encodeBase64Url(JSON.stringify(claims))}`;
  return `${signingInput}.${cryptoSign(null, Buffer.from(signingInput), key.privateKey).toString('base64url')}`;
}

/**
 * Verifica assinatura, forma e tempo, e so devolve o token se o tipo dele
 * estiver em `acceptedKinds`. A lista e obrigatoria: nao existe chamada que
 * aceite "qualquer tipo" por omissao.
 */
export function verifyJwt<K extends TokenUse>(
  token: string,
  keys: readonly PublicSigningJwk[],
  expectedIssuer: string,
  expectedAudience: string,
  now: Date,
  acceptedKinds: readonly K[],
): ClaimsOf<K> {
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
  if (header.alg !== JWT_ALGORITHM || !nonEmpty(header.kid))
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
  const kind = claims.token_use;
  if (typeof kind !== 'string' || !(TOKEN_USES as readonly string[]).includes(kind))
    invalid('Unknown token kind');
  const rule = TOKEN_KIND_RULES[kind as TokenUse];
  if (header.typ !== rule.headerTyp) invalid('Invalid token header');
  exactKeys(claims, rule.allowedKeys, 'payload');
  assertClaims(claims, rule, expectedIssuer, expectedAudience, now);
  if (!(acceptedKinds as readonly string[]).includes(kind))
    invalid('Token kind not accepted');
  return claims as unknown as ClaimsOf<K>;
}
function assertClaims(
  value: Record<string, unknown>,
  rule: TokenKindRule,
  issuer: string,
  audience: string,
  now: Date,
): void {
  for (const field of rule.requiredStrings)
    if (!nonEmpty(value[field])) invalid('Invalid string claim');
  if (value.iss !== issuer || value.aud !== audience)
    invalid('Unexpected issuer or audience');
  for (const field of ['iat', 'exp'] as const)
    if (!Number.isInteger(value[field])) invalid('Invalid NumericDate');
  const iat = value.iat as number,
    exp = value.exp as number,
    current = Math.floor(now.getTime() / 1000),
    tolerance = SECURITY_POLICY.clockToleranceSeconds;
  if (
    exp - iat !== rule.ttlSeconds ||
    exp + tolerance < current ||
    iat - tolerance > current
  )
    invalid('Invalid token lifetime');
  if (!rule.checkClaims(value)) invalid('Invalid token claims');
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
function invalid(message: string): never {
  throw new InvalidTokenError(message);
}
