import { afterEach, describe, expect, it } from "vitest";
import { ulid } from "ulid";
import { createAuthDatabase, type AuthDatabase } from "../db/client";
import {
  createPostgresTestDatabase,
  describeWithPostgres,
  type PostgresTestDatabase,
} from "../testing/postgres-test-database";
import { PostgresSessionRepository } from "./postgres-session.repository";
import { PostgresSigningKeyRepository } from "../crypto/postgres-signing-key.repository";
import { generateSigningKey } from "../crypto/signing-key";
import { hashSecretToken } from "../crypto/secret-token";
import { ANONYMOUS_CONTEXT } from "../common/request-context";
import { AuthenticationFailedError } from "../common/errors";
import { SECURITY_POLICY } from "../config/security-policy";
import type { SignAccessToken } from "../crypto/jwt";
import type { AuthenticatedActor } from "../users/user";

let fixture: PostgresTestDatabase | undefined;
let db: AuthDatabase | undefined;
afterEach(async () => {
  await db?.close();
  db = undefined;
  await fixture?.close();
  fixture = undefined;
});

const sign: SignAccessToken = (key, claims) => `signed:${key.kid}:${claims.sub}:${claims.sid}`;

async function activateSigningKey(database: AuthDatabase, now: Date): Promise<void> {
  const repository = new PostgresSigningKeyRepository(database);
  const key = generateSigningKey();
  await repository.ensureActive(
    { kid: key.kid, publicJwk: key.publicJwk, encryptedPrivateKey: "ciphertext" },
    now,
    {
      correlationId: "session-repo-test",
      actorUserId: null,
      action: "key.created",
      targetType: "signing_key",
      targetId: null,
      result: "succeeded",
      reason: null,
      metadata: {},
      context: ANONYMOUS_CONTEXT,
      occurredAt: now,
    },
  );
}

async function seedUser(database: AuthDatabase, status: "active" | "suspended" | "disabled" = "active"): Promise<string> {
  const id = ulid();
  await database.query(
    `INSERT INTO users (id, email, name, password_hash, status, created_at, updated_at)
     VALUES ($1, $2, 'Test User', 'hash', $3, now(), now())`,
    [id, `${id}@example.test`, status],
  );
  return id;
}

async function seedSession(
  database: AuthDatabase,
  userId: string,
  now: Date,
  overrides: { revokedAt?: Date; refreshTokenIssuedAt?: Date; consumedAt?: Date } = {},
): Promise<{ sessionId: string; tokenHash: string }> {
  const sessionId = ulid();
  await database.query(
    `INSERT INTO sessions (id, user_id, amr, auth_time, last_used_at, revoked_at, ended_at, created_at)
     VALUES ($1, $2, ARRAY['pwd'], $3, $3, $4, $4, $3)`,
    [sessionId, userId, now, overrides.revokedAt ?? null],
  );
  const tokenHash = hashSecretToken(ulid());
  // O CHECK do banco exige expires_at = created_at + 30 dias exatos.
  const issuedAt = overrides.refreshTokenIssuedAt ?? now;
  const expiresAt = new Date(issuedAt.getTime() + SECURITY_POLICY.refreshTokenTtlSeconds * 1000);
  await database.query(
    `INSERT INTO refresh_tokens (id, token_hash, session_id, expires_at, consumed_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [ulid(), tokenHash, sessionId, expiresAt, overrides.consumedAt ?? null, issuedAt],
  );
  return { sessionId, tokenHash };
}

async function auditActionsFor(database: AuthDatabase, targetId: string): Promise<string[]> {
  const result = await database.query<{ action: string }>(
    "SELECT action FROM audit_log WHERE target_id = $1 ORDER BY created_at",
    [targetId],
  );
  return result.rows.map((row) => row.action);
}

function successorFor(now: Date) {
  return {
    id: ulid(),
    hash: hashSecretToken(ulid()),
    issuedAt: now,
    expiresAt: new Date(now.getTime() + SECURITY_POLICY.refreshTokenTtlSeconds * 1000),
  };
}

describeWithPostgres("PostgresSessionRepository", () => {
  it("rotates a live refresh token, signs an access token, and audits session.refreshed", async () => {
    fixture = await createPostgresTestDatabase();
    db = createAuthDatabase({ connectionString: fixture.runtimeUrl });
    const now = new Date("2026-09-04T00:00:00Z");
    await activateSigningKey(db, now);
    const userId = await seedUser(db);
    const { sessionId, tokenHash } = await seedSession(db, userId, now);
    const repository = new PostgresSessionRepository(db, "https://auth.timeline.local", "timeline-api");

    const result = await repository.rotateRefreshToken(
      { presentedTokenHash: tokenHash, successor: successorFor(now), now, context: ANONYMOUS_CONTEXT },
      sign,
    );

    expect(result.kind).toBe("rotated");
    if (result.kind !== "rotated") throw new Error("unreachable");
    expect(result.session.id).toBe(sessionId);
    expect(result.accessToken).toContain(`:${userId}:${sessionId}`);
    expect(await auditActionsFor(db, sessionId)).toEqual(["session.refreshed"]);

    const sessionRow = await db.query<{ last_used_at: Date }>("SELECT last_used_at FROM sessions WHERE id = $1", [sessionId]);
    expect(sessionRow.rows[0]?.last_used_at).toEqual(now);
  });

  it("detects reuse of an already-consumed token, revokes the whole session, and audits it", async () => {
    fixture = await createPostgresTestDatabase();
    db = createAuthDatabase({ connectionString: fixture.runtimeUrl });
    const now = new Date("2026-09-04T00:00:00Z");
    await activateSigningKey(db, now);
    const userId = await seedUser(db);
    const { sessionId, tokenHash } = await seedSession(db, userId, now, { consumedAt: now });
    const repository = new PostgresSessionRepository(db, "https://auth.timeline.local", "timeline-api");

    const result = await repository.rotateRefreshToken(
      { presentedTokenHash: tokenHash, successor: successorFor(now), now, context: ANONYMOUS_CONTEXT },
      sign,
    );

    expect(result.kind).toBe("reused");
    const sessionRow = await db.query<{ revoked_at: Date | null }>("SELECT revoked_at FROM sessions WHERE id = $1", [sessionId]);
    expect(sessionRow.rows[0]?.revoked_at).not.toBeNull();
    expect(await auditActionsFor(db, sessionId)).toEqual(["token.reuse_detected"]);

    const second = await repository.rotateRefreshToken(
      { presentedTokenHash: tokenHash, successor: successorFor(now), now, context: ANONYMOUS_CONTEXT },
      sign,
    );
    expect(second.kind).toBe("reused");
    expect(await auditActionsFor(db, sessionId)).toEqual(["token.reuse_detected"]);
  });

  it("revokes an otherwise-live session when the presented refresh token has expired", async () => {
    fixture = await createPostgresTestDatabase();
    db = createAuthDatabase({ connectionString: fixture.runtimeUrl });
    const now = new Date("2026-09-04T00:00:00Z");
    await activateSigningKey(db, now);
    const userId = await seedUser(db);
    const longAgo = new Date(now.getTime() - (SECURITY_POLICY.refreshTokenTtlSeconds + 86400) * 1000);
    const { sessionId, tokenHash } = await seedSession(db, userId, now, { refreshTokenIssuedAt: longAgo });

    const repository = new PostgresSessionRepository(db, "https://auth.timeline.local", "timeline-api");
    const result = await repository.rotateRefreshToken(
      { presentedTokenHash: tokenHash, successor: successorFor(now), now, context: ANONYMOUS_CONTEXT },
      sign,
    );

    expect(result.kind).toBe("invalid");
    const sessionRow = await db.query<{ revoked_at: Date | null }>("SELECT revoked_at FROM sessions WHERE id = $1", [sessionId]);
    expect(sessionRow.rows[0]?.revoked_at).not.toBeNull();
    expect(await auditActionsFor(db, sessionId)).toEqual(["session.revoked"]);
  });

  it("returns invalid for an unknown token hash without touching any session", async () => {
    fixture = await createPostgresTestDatabase();
    db = createAuthDatabase({ connectionString: fixture.runtimeUrl });
    const now = new Date();
    await activateSigningKey(db, now);
    const repository = new PostgresSessionRepository(db, "https://auth.timeline.local", "timeline-api");

    const result = await repository.rotateRefreshToken(
      { presentedTokenHash: hashSecretToken("never-issued"), successor: successorFor(now), now, context: ANONYMOUS_CONTEXT },
      sign,
    );

    expect(result.kind).toBe("invalid");
  });

  it("revokeByRefreshToken revokes the matching session, audits it, and is a silent no-op otherwise", async () => {
    fixture = await createPostgresTestDatabase();
    db = createAuthDatabase({ connectionString: fixture.runtimeUrl });
    const now = new Date();
    const userId = await seedUser(db);
    const { sessionId, tokenHash } = await seedSession(db, userId, now);
    const repository = new PostgresSessionRepository(db, "https://auth.timeline.local", "timeline-api");

    const unknown = await repository.revokeByRefreshToken({ presentedTokenHash: "not-a-real-hash", now, context: ANONYMOUS_CONTEXT });
    expect(unknown).toBe(false);

    const first = await repository.revokeByRefreshToken({ presentedTokenHash: tokenHash, now, context: ANONYMOUS_CONTEXT });
    expect(first).toBe(true);
    expect(await auditActionsFor(db, sessionId)).toEqual(["session.revoked"]);

    const second = await repository.revokeByRefreshToken({ presentedTokenHash: tokenHash, now, context: ANONYMOUS_CONTEXT });
    expect(second).toBe(false);
    expect(await auditActionsFor(db, sessionId)).toEqual(["session.revoked"]);
  });

  it("revokeAllOfUser revokes every live session of the user and audits once with the count", async () => {
    fixture = await createPostgresTestDatabase();
    db = createAuthDatabase({ connectionString: fixture.runtimeUrl });
    const now = new Date();
    const userId = await seedUser(db);
    const { sessionId: firstSessionId } = await seedSession(db, userId, now);
    const { sessionId: secondSessionId } = await seedSession(db, userId, now);
    const repository = new PostgresSessionRepository(db, "https://auth.timeline.local", "timeline-api");
    const actor: AuthenticatedActor = {
      userId,
      sessionId: firstSessionId,
      roles: [],
      permissions: [],
      denies: [],
      amr: ["pwd"],
      authTime: Math.floor(now.getTime() / 1000),
    };

    const count = await repository.revokeAllOfUser({ actor, now, context: ANONYMOUS_CONTEXT });

    expect(count).toBe(2);
    const revoked = await db.query<{ id: string }>("SELECT id FROM sessions WHERE user_id = $1 AND revoked_at IS NOT NULL", [userId]);
    expect(revoked.rows.map((row) => row.id).sort()).toEqual([firstSessionId, secondSessionId].sort());
    expect(await auditActionsFor(db, firstSessionId)).toEqual(["session.revoked_all"]);
  });

  it("revokeAllOfUser rejects when the actor's own session is no longer active", async () => {
    fixture = await createPostgresTestDatabase();
    db = createAuthDatabase({ connectionString: fixture.runtimeUrl });
    const now = new Date();
    const userId = await seedUser(db);
    const { sessionId } = await seedSession(db, userId, now, { revokedAt: now });
    const repository = new PostgresSessionRepository(db, "https://auth.timeline.local", "timeline-api");
    const actor: AuthenticatedActor = {
      userId,
      sessionId,
      roles: [],
      permissions: [],
      denies: [],
      amr: ["pwd"],
      authTime: Math.floor(now.getTime() / 1000),
    };

    await expect(repository.revokeAllOfUser({ actor, now, context: ANONYMOUS_CONTEXT })).rejects.toBeInstanceOf(
      AuthenticationFailedError,
    );
  });

  it("revokeAllOfUser rejects when the user is no longer active", async () => {
    fixture = await createPostgresTestDatabase();
    db = createAuthDatabase({ connectionString: fixture.runtimeUrl });
    const now = new Date();
    const userId = await seedUser(db, "suspended");
    const { sessionId } = await seedSession(db, userId, now);
    const repository = new PostgresSessionRepository(db, "https://auth.timeline.local", "timeline-api");
    const actor: AuthenticatedActor = {
      userId,
      sessionId,
      roles: [],
      permissions: [],
      denies: [],
      amr: ["pwd"],
      authTime: Math.floor(now.getTime() / 1000),
    };

    await expect(repository.revokeAllOfUser({ actor, now, context: ANONYMOUS_CONTEXT })).rejects.toBeInstanceOf(
      AuthenticationFailedError,
    );
  });

  it("findActiveSession returns the session when live and null once revoked", async () => {
    fixture = await createPostgresTestDatabase();
    db = createAuthDatabase({ connectionString: fixture.runtimeUrl });
    const now = new Date();
    const userId = await seedUser(db);
    const { sessionId } = await seedSession(db, userId, now);
    const repository = new PostgresSessionRepository(db, "https://auth.timeline.local", "timeline-api");

    const active = await repository.findActiveSession({ sessionId, userId });
    expect(active?.id).toBe(sessionId);

    await db.query("UPDATE sessions SET revoked_at = $1, ended_at = $1 WHERE id = $2", [now, sessionId]);
    const revoked = await repository.findActiveSession({ sessionId, userId });
    expect(revoked).toBeNull();
  });
});
