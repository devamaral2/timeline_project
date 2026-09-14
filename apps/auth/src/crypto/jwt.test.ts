import { describe, expect, it } from 'vitest';
import { createPublicKey, sign as cryptoSign } from 'node:crypto';
import { encodeBase64Url } from './base64url';
import {
  buildUnsignedAccessTokenClaims,
  buildUnsignedGuestTokenClaims,
  buildUnsignedSignupTokenClaims,
  InvalidTokenError,
  signJwt,
  TOKEN_USES,
  verifyJwt,
  type GuestTokenClaims,
  type SignupTokenClaims,
  type TokenClaims,
  type UserTokenClaims,
} from './jwt';
import {
  generateSigningKey,
  privateKeyFromPem,
  toPublicJwk,
} from './signing-key';

const key = generateSigningKey();
const privateKey = privateKeyFromPem(key.privateKeyPem);
const keys = [key.publicJwk];
const signer = { kid: key.kid, privateKey };

const NOW = new Date('2026-08-30T12:00:00Z');
const ISSUED_AT = Math.floor(NOW.getTime() / 1000);
const ISSUER = 'https://auth.timeline.local';
const AUDIENCE = 'timeline-api';

function userClaims(overrides: Partial<UserTokenClaims> = {}): UserTokenClaims {
  return {
    iss: ISSUER,
    aud: AUDIENCE,
    sub: 'user-1',
    sid: 'session-1',
    jti: 'token-1',
    iat: ISSUED_AT,
    exp: ISSUED_AT + 900,
    token_use: 'user',
    perms: ['*:manage'],
    denies: [],
    roles: ['admin'],
    ...overrides,
  };
}
function signupClaims(overrides: Partial<SignupTokenClaims> = {}): SignupTokenClaims {
  return {
    iss: ISSUER,
    aud: AUDIENCE,
    sub: 'pending-1',
    jti: 'signup-jti',
    iat: ISSUED_AT,
    exp: ISSUED_AT + 3600,
    token_use: 'signup',
    ...overrides,
  };
}
function guestClaims(overrides: Partial<GuestTokenClaims> = {}): GuestTokenClaims {
  return {
    iss: ISSUER,
    aud: AUDIENCE,
    sub: 'guest-1',
    subj: 'user-1',
    jti: 'guest-jti',
    iat: ISSUED_AT,
    exp: ISSUED_AT + 3600,
    token_use: 'guest',
    perms: ['event:read', 'tag:read'],
    ...overrides,
  };
}

function verify(token: string, accepted: readonly TokenClaims['token_use'][] = TOKEN_USES, now = NOW) {
  return verifyJwt(token, keys, ISSUER, AUDIENCE, now, accepted);
}

/** Assina header e payload arbitrarios com a chave valida: e o jeito de testar
 *  o que o verificador faz com formas que `signJwt` nunca produziria. */
function signRaw(header: Record<string, unknown>, payload: Record<string, unknown>): string {
  const input = `${encodeBase64Url(JSON.stringify(header))}.${encodeBase64Url(JSON.stringify(payload))}`;
  return `${input}.${cryptoSign(null, Buffer.from(input), privateKey).toString('base64url')}`;
}
function headerOf(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split('.')[0]!, 'base64url').toString('utf8'));
}

describe('jwt — tres tipos de token', () => {
  it.each([
    ['user', userClaims()],
    ['signup', signupClaims()],
    ['guest', guestClaims()],
  ] as const)('emite e verifica um token %s', (kind, claims) => {
    const token = signJwt(claims, signer);
    expect(verify(token, [kind])).toEqual(claims);
  });

  it('usa um typ de header distinto por tipo', () => {
    expect(headerOf(signJwt(userClaims(), signer)).typ).toBe('at+jwt');
    expect(headerOf(signJwt(signupClaims(), signer)).typ).toBe('signup+jwt');
    expect(headerOf(signJwt(guestClaims(), signer)).typ).toBe('guest+jwt');
  });

  it('recusa um token cujo tipo nao esta na lista aceita pela chamada', () => {
    expect(() => verify(signJwt(guestClaims(), signer), ['user'])).toThrow(/kind not accepted/);
    expect(() => verify(signJwt(signupClaims(), signer), ['user', 'guest'])).toThrow(/kind not accepted/);
    expect(() => verify(signJwt(userClaims(), signer), ['signup'])).toThrow(/kind not accepted/);
  });

  it('recusa token sem token_use — inclusive o formato emitido antes do corte', () => {
    const legacy = { ...userClaims(), amr: ['pwd'], auth_time: ISSUED_AT } as Record<string, unknown>;
    delete legacy.token_use;
    expect(() => verify(signRaw({ alg: 'EdDSA', typ: 'at+jwt', kid: key.kid }, legacy))).toThrow(/Unknown token kind/);
  });

  it('recusa token_use desconhecido', () => {
    expect(() =>
      verify(signRaw({ alg: 'EdDSA', typ: 'at+jwt', kid: key.kid }, { ...userClaims(), token_use: 'admin' })),
    ).toThrow(/Unknown token kind/);
  });

  it('recusa quando o typ do header nao corresponde ao token_use', () => {
    expect(() => verify(signRaw({ alg: 'EdDSA', typ: 'at+jwt', kid: key.kid }, { ...guestClaims() }))).toThrow(/header/);
  });

  it('mantem o allowlist exato por tipo: nenhuma claim de outro tipo e contrabandeada', () => {
    const userWithSubj = signRaw({ alg: 'EdDSA', typ: 'at+jwt', kid: key.kid }, { ...userClaims(), subj: 'other' });
    const signupWithPerms = signRaw({ alg: 'EdDSA', typ: 'signup+jwt', kid: key.kid }, { ...signupClaims(), perms: ['*:manage'] });
    const guestWithSid = signRaw({ alg: 'EdDSA', typ: 'guest+jwt', kid: key.kid }, { ...guestClaims(), sid: 's' });
    const userWithoutRoles = { ...userClaims() } as Record<string, unknown>;
    delete userWithoutRoles.roles;
    for (const token of [userWithSubj, signupWithPerms, guestWithSid, signRaw({ alg: 'EdDSA', typ: 'at+jwt', kid: key.kid }, userWithoutRoles)]) {
      expect(() => verify(token)).toThrow(/Unexpected payload claim/);
    }
  });

  it('recusa as claims amr e auth_time, que sairam com a MFA', () => {
    const token = signRaw({ alg: 'EdDSA', typ: 'at+jwt', kid: key.kid }, { ...userClaims(), amr: ['pwd'], auth_time: ISSUED_AT });
    expect(() => verify(token)).toThrow(InvalidTokenError);
  });

  describe('TTL por tipo, cada um independente', () => {
    it('um token de usuario com a janela de uma hora e recusado', () => {
      expect(() => verify(signJwt(userClaims({ exp: ISSUED_AT + 3600 }), signer))).toThrow(/lifetime/);
    });
    it('um signup ou guest com a janela de 900s e recusado', () => {
      expect(() => verify(signJwt(signupClaims({ exp: ISSUED_AT + 900 }), signer))).toThrow(/lifetime/);
      expect(() => verify(signJwt(guestClaims({ exp: ISSUED_AT + 900 }), signer))).toThrow(/lifetime/);
    });
    it.each([
      ['signup', signupClaims()],
      ['guest', guestClaims()],
    ] as const)('o %s vale na hora inteira e morre depois dela, alem da tolerancia', (kind, claims) => {
      const token = signJwt(claims, signer);
      expect(verify(token, [kind], new Date(NOW.getTime() + 3600_000)).sub).toBe(claims.sub);
      expect(() => verify(token, [kind], new Date(NOW.getTime() + 3601_000 + 30_000))).toThrow(/lifetime/);
    });
    it('o token de usuario morre depois de 900s alem da tolerancia', () => {
      const token = signJwt(userClaims(), signer);
      expect(verify(token, ['user'], new Date(NOW.getTime() + 910_000)).sub).toBe('user-1');
      expect(() => verify(token, ['user'], new Date(NOW.getTime() + 901_000 + 31_000))).toThrow(/lifetime/);
    });
    it('os builders fixam o TTL de cada tipo', () => {
      const user = buildUnsignedAccessTokenClaims({ iss: ISSUER, aud: AUDIENCE, sub: 'u', sid: 's', perms: [], denies: [], roles: [], now: NOW });
      const signup = buildUnsignedSignupTokenClaims({ iss: ISSUER, aud: AUDIENCE, sub: 'p', now: NOW });
      const guest = buildUnsignedGuestTokenClaims({ iss: ISSUER, aud: AUDIENCE, sub: 'g', subj: 'u', perms: [], now: NOW });
      expect([user.exp - user.iat, signup.exp - signup.iat, guest.exp - guest.iat]).toEqual([900, 3600, 3600]);
      expect([user.token_use, signup.token_use, guest.token_use]).toEqual(['user', 'signup', 'guest']);
    });
  });

  it('recusa um guest que observa a si mesmo', () => {
    expect(() => verify(signJwt(guestClaims({ subj: 'guest-1' }), signer))).toThrow(/claims/);
  });
});

describe('jwt — assinatura, emissor e forma', () => {
  it('recusa token assinado por outra chave', () => {
    const other = generateSigningKey();
    const token = signJwt(userClaims(), { kid: key.kid, privateKey: privateKeyFromPem(other.privateKeyPem) });
    expect(() => verify(token)).toThrow(/signature/i);
  });

  it('recusa kid desconhecido antes de verificar assinatura', () => {
    const token = signJwt(userClaims(), { kid: 'kid-de-outro-emissor', privateKey });
    expect(() => verify(token)).toThrow(InvalidTokenError);
  });

  // O ataque classico do JWT: trocar o header por `alg: none` e apagar a
  // assinatura. O algoritmo nunca vem do token.
  it('recusa alg none mesmo com payload valido', () => {
    const header = encodeBase64Url(JSON.stringify({ alg: 'none', typ: 'JWT', kid: key.kid }));
    const payload = encodeBase64Url(JSON.stringify(userClaims()));
    expect(() => verify(`${header}.${payload}.`)).toThrow(InvalidTokenError);
  });

  it('recusa token emitido para outra audiencia ou por outro emissor', () => {
    expect(() => verify(signJwt(userClaims({ aud: 'outro-servico' }), signer))).toThrow(/issuer|audience/i);
    expect(() => verify(signJwt(guestClaims({ iss: 'https://evil.example' }), signer))).toThrow(/issuer|audience/i);
  });

  it('recusa claims de permissao malformadas e papeis duplicados', () => {
    expect(() => verify(signJwt(userClaims({ roles: ['admin', 'admin'] }), signer))).toThrow(InvalidTokenError);
    expect(() => verify(signJwt(guestClaims({ perms: ['not-a-permission' as never] }), signer))).toThrow(InvalidTokenError);
  });

  it('exporta a chave publica em JWK que o node reimporta', () => {
    expect(key.publicJwk).toMatchObject({ kty: 'OKP', crv: 'Ed25519', alg: 'EdDSA', use: 'sig' });
    expect(createPublicKey({ key: key.publicJwk as never, format: 'jwk' }).type).toBe('public');
  });

  it('recusa export JWK que nao e uma chave publica Ed25519', () => {
    const malformedKey = { export: () => ({ kty: 'EC', crv: 'P-256', x: 'not-an-ed25519-key' }) };
    expect(() => toPublicJwk(malformedKey as never, 'kid-test')).toThrow(/Ed25519/i);
  });
});
