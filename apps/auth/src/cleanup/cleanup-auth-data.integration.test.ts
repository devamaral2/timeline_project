import { afterEach, describe, expect, it } from 'vitest';
import { ulid } from 'ulid';
import { cleanupAuthData } from './cleanup-auth-data';
import { createAuthDatabase, type AuthDatabase } from '../db/client';
import { createPostgresTestDatabase, describeWithPostgres, type PostgresTestDatabase } from '../testing/postgres-test-database';
import { ANONYMOUS_CONTEXT } from '../common/request-context';

let fixture: PostgresTestDatabase | undefined;
let database: AuthDatabase | undefined;
afterEach(async () => { await database?.close(); database = undefined; await fixture?.close(); fixture = undefined; });

describeWithPostgres('cleanupAuthData', () => {
  it('cleans terminal data at its retention boundary and records an append-only summary', async () => {
    fixture = await createPostgresTestDatabase();
    database = createAuthDatabase({ connectionString: fixture.runtimeUrl });
    const now = new Date('2026-09-04T00:00:00.000Z');
    const old = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const userId = ulid(); const inviteId = ulid(); const attemptId = ulid(); const challengeId = ulid(); const sessionId = ulid();
    await database.query("INSERT INTO users(id,email,name,status,created_at,updated_at) VALUES($1,$2,'Cleanup User','pending_invite',$3,$3)", [userId, `${userId}@example.test`, old]);
    await database.query('INSERT INTO invites(id,token_hash,user_id,expires_at,accepted_at,created_at) VALUES($1,$2,$3,$4,$5,$6)', [inviteId, ulid(), userId, old, new Date(now.getTime() - 30 * 86400_000), old]);
    await database.query("INSERT INTO authentication_attempts(id,token_hash,user_id,purpose,second_factor,first_methods,invite_id,expires_at,created_at) VALUES($1,$2,$3,'invite_acceptance','otp',ARRAY['pwd'],$4,$5,$6)", [attemptId, ulid(), userId, inviteId, old, old]);
    await database.query("INSERT INTO mfa_challenges(id,attempt_id,requested_channel,reported_channel,provider_challenge_id,expires_at,created_at) VALUES($1,$2,'sms','sms',$3,$4,$5)", [challengeId, attemptId, ulid(), old, old]);
    await database.query("INSERT INTO sessions(id,user_id,amr,auth_time,last_used_at,ended_at,created_at) VALUES($1,$2,ARRAY['pwd'],$3,$3,$4,$3)", [sessionId, userId, old, new Date(now.getTime() - 90 * 86400_000)]);
    await database.query("INSERT INTO rate_limit_buckets(scope,subject_hash,window_started_at,window_expires_at,hit_count,updated_at) VALUES('password_ip',$1,$2,$2,1,$2)", [ulid(), old]);
    await database.query('INSERT INTO recovery_codes(id,user_id,code_hash,generation,used_at,created_at) VALUES($1,$2,$3,1,$4,$4)', [ulid(), userId, ulid(), new Date(now.getTime() - 90 * 86400_000)]);
    await database.query("INSERT INTO signing_keys(kid,status,public_jwk,encrypted_private_key,created_at,retire_after) VALUES($1,'retiring',$2,'ciphertext',$3,$3)", [ulid(), JSON.stringify({ kty: 'OKP', crv: 'Ed25519', x: 'x', kid: 'test', use: 'sig', alg: 'EdDSA' }), old]);

    const result = await cleanupAuthData({ database, now, context: { ...ANONYMOUS_CONTEXT, correlationId: 'cleanup-test' } });

    expect(result).toMatchObject({ lockAcquired: true, authenticationAttemptsDeleted: 1, mfaChallengesDeleted: 1, rateLimitBucketsDeleted: 1, invitesDeleted: 1, recoveryCodesDeleted: 1, sessionsDeleted: 1, signingKeysRetired: 1 });
    expect((await database.query("SELECT count(*)::int AS count FROM audit_log WHERE action IN ('key.retired','cleanup.completed')")).rows[0]?.count).toBe(2);
    expect(await cleanupAuthData({ database, now, context: ANONYMOUS_CONTEXT })).toMatchObject({ lockAcquired: true, authenticationAttemptsDeleted: 0, mfaChallengesDeleted: 0, sessionsDeleted: 0, signingKeysRetired: 0 });
  });
});
