import { afterEach, describe, expect, it } from 'vitest';
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
import type { AuditEventInput } from '../audit/audit-event';
import { ANONYMOUS_CONTEXT } from '../common/request-context';

let fixture: PostgresTestDatabase | undefined;
let db: AuthDatabase | undefined;
afterEach(async () => {
  await db?.close();
  db = undefined;
  await fixture?.close();
  fixture = undefined;
});
const audit = (
  action: AuditEventInput['action'],
  now: Date,
): AuditEventInput => ({
  correlationId: 'keys-test',
  actorUserId: null,
  action,
  targetType: 'signing_key',
  targetId: null,
  result: 'succeeded',
  reason: null,
  metadata: {},
  context: ANONYMOUS_CONTEXT,
  occurredAt: now,
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
  it('keeps exactly one active key, audits rotation, and keeps the retiring key publishable', async () => {
    fixture = await createPostgresTestDatabase();
    db = createAuthDatabase({ connectionString: fixture.runtimeUrl });
    const repository = new PostgresSigningKeyRepository(db);
    const now = new Date('2026-08-31T00:00:00Z');
    const first = await repository.ensureActive(
      candidate(),
      now,
      audit('key.created', now),
    );
    const same = await repository.ensureActive(
      candidate(),
      now,
      audit('key.created', now),
    );
    expect(same.kid).toBe(first.kid);
    await db.transaction((tx) =>
      lockActiveSigningKey(tx, new Date(now.getTime() + 1000)),
    );
    const next = await repository.rotate(
      candidate(),
      new Date(now.getTime() + 2000),
      audit('key.rotated', now),
    );
    const publishable = await repository.listPublishable();
    expect(publishable.map((key) => key.kid)).toEqual(
      [first.kid, next.kid].sort(),
    );
    expect(
      publishable.find((key) => key.kid === first.kid)?.retireAfter,
    ).toEqual(new Date(now.getTime() + 932000));
    const count = await db.query(
      "SELECT count(*)::int AS count FROM signing_keys WHERE status='active'",
    );
    expect(count.rows[0]?.count).toBe(1);
  });
});
