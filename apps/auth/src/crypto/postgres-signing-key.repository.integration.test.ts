import { afterEach, expect, it } from 'vitest';
import { createAuthDatabase, type AuthDatabase } from '../db/client';
import {
  createPostgresTestDatabase,
  describeWithPostgres,
  type PostgresTestDatabase,
} from '../testing/postgres-test-database';
import {
  PostgresSigningKeyRepository,
  lockActiveSigningKey,
} from './postgres-signing-key.repository';
import { generateSigningKey } from './signing-key';
import { SECURITY_POLICY } from '../config/security-policy';
import { tokenTtlSeconds, TOKEN_USES } from './jwt';

let fixture: PostgresTestDatabase | undefined;
let db: AuthDatabase | undefined;
afterEach(async () => {
  await db?.close();
  db = undefined;
  await fixture?.close();
  fixture = undefined;
});
const candidate = () => {
  const key = generateSigningKey();
  return {
    kid: key.kid,
    publicJwk: key.publicJwk,
    encryptedPrivateKey: 'ciphertext',
  };
};

describeWithPostgres('PostgresSigningKeyRepository', () => {
  it('keeps exactly one active key and keeps the retiring key publishable', async () => {
    fixture = await createPostgresTestDatabase();
    db = createAuthDatabase({ connectionString: fixture.runtimeUrl });
    const repository = new PostgresSigningKeyRepository(db);
    const now = new Date(Math.floor(Date.now() / 1000) * 1000);
    const first = await repository.ensureActive(candidate(), now);
    const same = await repository.ensureActive(candidate(), now);
    expect(same.kid).toBe(first.kid);
    await db.transaction((tx) =>
      lockActiveSigningKey(tx, new Date(now.getTime() + 1000)),
    );
    const next = await repository.rotate(
      candidate(),
      new Date(now.getTime() + 2000),
    );
    const publishable = await repository.listPublishable();
    expect(publishable.map((key) => key.kid)).toEqual(
      [first.kid, next.kid].sort(),
    );
    expect(
      publishable.find((key) => key.kid === first.kid)?.retireAfter,
    ).toEqual(new Date(now.getTime() + 2000 + SECURITY_POLICY.signingKeyRetireDelaySeconds * 1000));
    const count = await db.query(
      "SELECT count(*)::int AS count FROM signing_keys WHERE status='active'",
    );
    expect(count.rows[0]?.count).toBe(1);
  });
});

it('keeps a retiring key published long enough for the longest-lived token kind', () => {
  const longest = Math.max(...TOKEN_USES.map(tokenTtlSeconds));
  expect(SECURITY_POLICY.signingKeyRetireDelaySeconds).toBeGreaterThanOrEqual(longest + SECURITY_POLICY.clockToleranceSeconds);
});

describeWithPostgres('PostgresSigningKeyRepository retirement', () => {
  it('stops publishing a retiring key at retire_after and wipes its private key on the next key write', async () => {
    fixture = await createPostgresTestDatabase();
    db = createAuthDatabase({ connectionString: fixture.runtimeUrl });
    const repository = new PostgresSigningKeyRepository(db);
    const longAgo = new Date(Date.now() - 24 * 3600_000);
    const first = await repository.ensureActive(candidate(), longAgo);
    const second = await repository.rotate(candidate(), longAgo);

    // retire_after do primeiro ficou ~15 min depois de longAgo: ja venceu.
    expect((await repository.listPublishable()).map((key) => key.kid)).toEqual([second.kid]);
    expect((await db.query("SELECT status, encrypted_private_key IS NULL AS wiped FROM signing_keys WHERE kid = $1", [first.kid])).rows[0]).toEqual({ status: 'retiring', wiped: false });

    const third = await repository.rotate(candidate(), new Date());
    expect((await db.query("SELECT status, encrypted_private_key IS NULL AS wiped FROM signing_keys WHERE kid = $1", [first.kid])).rows[0]).toEqual({ status: 'retired', wiped: true });
    expect((await repository.listPublishable()).map((key) => key.kid).sort()).toEqual([second.kid, third.kid].sort());
    expect(await repository.retireExpired(new Date())).toEqual([]);
  });

  it('retireExpired retires immediately what an operator forced to expire', async () => {
    fixture = await createPostgresTestDatabase();
    db = createAuthDatabase({ connectionString: fixture.runtimeUrl });
    const repository = new PostgresSigningKeyRepository(db);
    const now = new Date();
    const first = await repository.ensureActive(candidate(), now);
    await repository.rotate(candidate(), now);
    await db.query("UPDATE signing_keys SET retire_after = $1 WHERE kid = $2", [now, first.kid]);

    expect(await repository.retireExpired(now)).toEqual([first.kid]);
  });
});
