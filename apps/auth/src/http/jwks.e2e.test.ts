import { afterEach, describe, expect, it } from 'vitest';
import {
  createPostgresTestDatabase,
  describeWithPostgres,
  type PostgresTestDatabase,
} from '../testing/postgres-test-database';
import { createTestApp, type TestApp } from '../testing/create-test-app';
import { SigningKeyService } from '../crypto/signing-key.service';
import { ANONYMOUS_CONTEXT } from '../common/request-context';

let fixture: PostgresTestDatabase | undefined;
let app: TestApp | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
  await fixture?.close();
  fixture = undefined;
});
describeWithPostgres('JWKS', () => {
  it('publishes only public material with a strong ETag and supports 304', async () => {
    fixture = await createPostgresTestDatabase();
    app = await createTestApp({ AUTH_DATABASE_URL: fixture.runtimeUrl });
    const now = new Date();
    await app.app
      .get(SigningKeyService)
      .ensureActive(now, {
        correlationId: 'jwks-test',
        actorUserId: null,
        action: 'key.created',
        targetType: 'signing_key',
        targetId: null,
        result: 'succeeded',
        reason: null,
        metadata: {},
        context: ANONYMOUS_CONTEXT,
        occurredAt: now,
      });
    const response = await fetch(`${app.url}/.well-known/jwks.json`);
    const text = await response.text();
    const etag = response.headers.get('etag');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=300, stale-if-error=3600',
    );
    expect(etag).toMatch(/^"sha256-/);
    expect(text).not.toContain('encryptedPrivateKey');
    expect(text).not.toContain('"d"');
    expect(JSON.parse(text).keys).toHaveLength(1);
    const cached = await fetch(`${app.url}/.well-known/jwks.json`, {
      headers: { 'if-none-match': etag! },
    });
    expect(cached.status).toBe(304);
    expect(await cached.text()).toBe('');
  });
});
