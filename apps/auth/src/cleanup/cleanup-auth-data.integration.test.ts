import { afterEach, expect, it } from "vitest";
import { ulid } from "ulid";
import { cleanupAuthData } from "./cleanup-auth-data";
import { createAuthDatabase, type AuthDatabase } from "../db/client";
import { createPostgresTestDatabase, describeWithPostgres, type PostgresTestDatabase } from "../testing/postgres-test-database";
import { ANONYMOUS_CONTEXT } from "../common/request-context";

let fixture: PostgresTestDatabase | undefined;
let database: AuthDatabase | undefined;
let admin: AuthDatabase | undefined;
afterEach(async () => {
  await admin?.close(); admin = undefined;
  await database?.close(); database = undefined;
  await fixture?.close(); fixture = undefined;
});

const now = new Date("2026-09-04T00:00:00.000Z");
const context = { ...ANONYMOUS_CONTEXT, correlationId: "cleanup-test" };
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
/** O corte exato de cada retencao, e um milissegundo depois dele -- a linha
 *  mais nova por um milissegundo e a que precisa sobreviver. */
const at = (ms: number) => new Date(now.getTime() - ms);
const justAfter = (ms: number) => new Date(now.getTime() - ms + 1);

const jwk = JSON.stringify({ kty: "OKP", crv: "Ed25519", x: "x", kid: "k", use: "sig", alg: "EdDSA" });

async function open(): Promise<AuthDatabase> {
  fixture = await createPostgresTestDatabase();
  database = createAuthDatabase({ connectionString: fixture.runtimeUrl });
  admin = createAuthDatabase({ connectionString: fixture.adminUrl });
  return database;
}

async function seedUser(db: AuthDatabase, id: string): Promise<void> {
  await db.query("INSERT INTO users(id,email,name,status,created_at,updated_at) VALUES($1,$2,'Cleanup','pending_invite',$3,$3)", [id, `${id}@example.test`, at(DAY)]);
}

/** Uma linha exatamente no corte e outra um milissegundo depois, para cada
 *  familia de dado que a retencao apaga. */
async function seedBoundaries(db: AuthDatabase, userId: string): Promise<void> {
  for (const [suffix, when] of [["old", at(24 * HOUR)], ["new", justAfter(24 * HOUR)]] as const) {
    const attemptId = `attempt-${suffix}`;
    await db.query("INSERT INTO authentication_attempts(id,token_hash,user_id,purpose,second_factor,first_methods,expires_at,consumed_at,created_at) VALUES($1,$2,$3,'login','otp',ARRAY['pwd'],$4,$4,$5)", [attemptId, `hash-${suffix}`, userId, when, at(2 * DAY)]);
    await db.query("INSERT INTO mfa_challenges(id,attempt_id,code_hash,expires_at,consumed_at,created_at) VALUES($1,$2,$3,$4,$4,$5)", [`challenge-${suffix}`, attemptId, `provider-${suffix}`, when, at(2 * DAY)]);
    await db.query("INSERT INTO rate_limit_buckets(scope,subject_hash,window_started_at,window_expires_at,hit_count,updated_at) VALUES('password_ip',$1,$2,$2,1,$2)", [`bucket-${suffix}`, when]);
    await db.query("INSERT INTO invites(id,token_hash,user_id,expires_at,revoked_at,created_at) VALUES($1,$2,$3,$4,$4,$5)", [`invite-${suffix}`, `invite-hash-${suffix}`, userId, whenFor(suffix, 30 * DAY), at(60 * DAY)]);
    await db.query("INSERT INTO recovery_codes(id,user_id,code_hash,generation,used_at,created_at) VALUES($1,$2,$3,1,$4,$5)", [`code-${suffix}`, userId, `code-hash-${suffix}`, whenFor(suffix, 90 * DAY), at(120 * DAY)]);
    await db.query("INSERT INTO sessions(id,user_id,amr,auth_time,last_used_at,revoked_at,ended_at,created_at) VALUES($1,$2,ARRAY['pwd'],$3,$3,$4,$4,$3)", [`session-${suffix}`, userId, at(120 * DAY), whenFor(suffix, 90 * DAY)]);
    await db.query("INSERT INTO refresh_tokens(id,token_hash,session_id,expires_at,created_at) VALUES($1,$2,$3,$4,$5)", [`refresh-${suffix}`, `refresh-hash-${suffix}`, `session-${suffix}`, new Date(at(120 * DAY).getTime() + 30 * DAY), at(120 * DAY)]);
  }
}

function whenFor(suffix: "old" | "new", ms: number): Date { return suffix === "old" ? at(ms) : justAfter(ms); }

describeWithPostgres("cleanupAuthData", () => {
  it("deletes exactly at each retention cut and keeps the row that is one millisecond newer", async () => {
    const db = await open();
    const userId = ulid();
    await seedUser(db, userId);
    await seedBoundaries(db, userId);
    await db.query("INSERT INTO signing_keys(kid,status,public_jwk,encrypted_private_key,created_at,retire_after) VALUES('retiring-old','retiring',$1,'ciphertext',$2,$3),('retiring-new','retiring',$1,'ciphertext',$2,$4)", [jwk, at(120 * DAY), at(0), justAfter(0)]);
    const auditBefore = (await admin!.query<{ id: string }>("SELECT id FROM audit_log ORDER BY id")).rows.map((row) => row.id);

    const result = await cleanupAuthData({ database: db, now, context });

    expect(result).toMatchObject({
      lockAcquired: true, authenticationAttemptsDeleted: 1, mfaChallengesDeleted: 1, rateLimitBucketsDeleted: 1,
      invitesDeleted: 1, recoveryCodesDeleted: 1, sessionsDeleted: 1, signingKeysRetired: 1,
    });
    for (const [table, survivor] of [["authentication_attempts", "attempt-new"], ["mfa_challenges", "challenge-new"], ["invites", "invite-new"], ["recovery_codes", "code-new"], ["sessions", "session-new"]] as const) {
      expect((await db.query<{ id: string }>(`SELECT id FROM ${table}`)).rows.map((row) => row.id)).toEqual([survivor]);
    }
    expect((await db.query<{ subject_hash: string }>("SELECT subject_hash FROM rate_limit_buckets")).rows.map((row) => row.subject_hash)).toEqual(["bucket-new"]);
    // A sessao apagada levou junto o refresh dela, por cascade.
    expect((await db.query<{ id: string }>("SELECT id FROM refresh_tokens")).rows.map((row) => row.id)).toEqual(["refresh-new"]);

    const keys = (await db.query<{ kid: string; status: string; encrypted_private_key: string | null; public_jwk: unknown }>("SELECT kid,status,encrypted_private_key,public_jwk FROM signing_keys ORDER BY kid")).rows;
    expect(keys).toEqual([
      { kid: "retiring-new", status: "retiring", encrypted_private_key: "ciphertext", public_jwk: expect.any(Object) },
      { kid: "retiring-old", status: "retired", encrypted_private_key: null, public_jwk: expect.any(Object) },
    ]);

    // A auditoria e append-only: as linhas anteriores continuam identicas, e a
    // execucao so acrescenta um `key.retired` por chave e um `cleanup.completed`.
    const auditAfter = (await admin!.query<{ id: string; action: string }>("SELECT id, action FROM audit_log ORDER BY id")).rows;
    expect(auditAfter.slice(0, auditBefore.length).map((row) => row.id)).toEqual(auditBefore);
    expect(auditAfter.slice(auditBefore.length).map((row) => row.action).sort()).toEqual(["cleanup.completed", "key.retired"]);

    // Segunda execucao nao encontra mais nada.
    expect(await cleanupAuthData({ database: db, now, context })).toMatchObject({
      lockAcquired: true, authenticationAttemptsDeleted: 0, mfaChallengesDeleted: 0, rateLimitBucketsDeleted: 0,
      invitesDeleted: 0, recoveryCodesDeleted: 0, sessionsDeleted: 0, signingKeysRetired: 0, sessionsEnded: 0,
    });
  });

  it("never removes a consumed refresh token while its session is still live", async () => {
    const db = await open();
    const userId = ulid();
    await seedUser(db, userId);
    await db.query("INSERT INTO sessions(id,user_id,amr,auth_time,last_used_at,created_at) VALUES('live',$1,ARRAY['pwd'],$2,$2,$2),('stale',$1,ARRAY['pwd'],$2,$2,$2)", [userId, at(2 * DAY)]);
    // A sessao viva tem um refresh consumido (a rotacao anterior) e um valido.
    await db.query("INSERT INTO refresh_tokens(id,token_hash,session_id,expires_at,consumed_at,created_at) VALUES('spent','spent-hash','live',$1,$2,$3)", [new Date(at(2 * DAY).getTime() + 30 * DAY), at(DAY), at(2 * DAY)]);
    await db.query("INSERT INTO refresh_tokens(id,token_hash,session_id,expires_at,created_at) VALUES('usable','usable-hash','live',$1,$2)", [new Date(at(2 * DAY).getTime() + 30 * DAY), at(2 * DAY)]);
    // A outra so tem um refresh ja consumido: nao ha como refresca-la de novo.
    await db.query("INSERT INTO refresh_tokens(id,token_hash,session_id,expires_at,consumed_at,created_at) VALUES('done','done-hash','stale',$1,$2,$3)", [new Date(at(2 * DAY).getTime() + 30 * DAY), at(DAY), at(2 * DAY)]);

    const result = await cleanupAuthData({ database: db, now, context });

    expect(result.sessionsEnded).toBe(1);
    expect((await db.query<{ id: string }>("SELECT id FROM refresh_tokens ORDER BY id")).rows.map((row) => row.id)).toEqual(["done", "spent", "usable"]);
    const sessions = (await db.query<{ id: string; ended_at: Date | null }>("SELECT id, ended_at FROM sessions ORDER BY id")).rows;
    expect(sessions.find((row) => row.id === "live")!.ended_at).toBeNull();
    expect(sessions.find((row) => row.id === "stale")!.ended_at).toEqual(now);
  });

  it("reverts the retirement, the deletes and the ended_at when an audit insert fails", async () => {
    const db = await open();
    const userId = ulid();
    await seedUser(db, userId);
    await seedBoundaries(db, userId);
    await db.query("INSERT INTO signing_keys(kid,status,public_jwk,encrypted_private_key,created_at,retire_after) VALUES('retiring-old','retiring',$1,'ciphertext',$2,$3)", [jwk, at(120 * DAY), at(0)]);
    await admin!.query("ALTER TABLE audit_log ADD CONSTRAINT audit_log_reject CHECK (false) NOT VALID");

    await expect(cleanupAuthData({ database: db, now, context })).rejects.toThrow();

    expect((await db.query<{ count: number }>("SELECT count(*)::int AS count FROM authentication_attempts")).rows[0]).toEqual({ count: 2 });
    expect((await db.query<{ count: number }>("SELECT count(*)::int AS count FROM sessions")).rows[0]).toEqual({ count: 2 });
    expect((await db.query<{ status: string; encrypted_private_key: string | null }>("SELECT status, encrypted_private_key FROM signing_keys")).rows[0]).toEqual({ status: "retiring", encrypted_private_key: "ciphertext" });
  });

  it("gives up without mutating anything when another cleanup already holds the lock", async () => {
    const db = await open();
    const userId = ulid();
    await seedUser(db, userId);
    await seedBoundaries(db, userId);

    // O lock e por transacao: segura-lo em outra conexao reproduz, sem corrida,
    // exatamente o que duas execucoes simultaneas veem.
    const contended = await db.transaction(async (tx) => {
      await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", ["timeline-auth:cleanup"]);
      return cleanupAuthData({ database: db, now, context });
    });

    expect(contended).toEqual({
      lockAcquired: false, sessionsEnded: 0, authenticationAttemptsDeleted: 0, mfaChallengesDeleted: 0,
      rateLimitBucketsDeleted: 0, invitesDeleted: 0, recoveryCodesDeleted: 0, sessionsDeleted: 0, signingKeysRetired: 0,
    });
    expect((await db.query<{ count: number }>("SELECT count(*)::int AS count FROM authentication_attempts")).rows[0]).toEqual({ count: 2 });
    expect((await admin!.query<{ count: number }>("SELECT count(*)::int AS count FROM audit_log WHERE action='cleanup.completed'")).rows[0]).toEqual({ count: 0 });
  });
});
