import { afterEach, expect, it } from "vitest";
import { ulid } from "ulid";
import { createAuthDatabase, type AuthDatabase } from "../db/client";
import { createPostgresTestDatabase, describeWithPostgres, type PostgresTestDatabase } from "../testing/postgres-test-database";
import { PostgresUserRepository } from "./postgres-user.repository";
import type { ChangeUserStatusCommand, ReplaceUserAccessCommand } from "./ports/user-repository";

let fixture: PostgresTestDatabase | undefined;
let db: AuthDatabase | undefined;
let admin: AuthDatabase | undefined;
afterEach(async () => { await admin?.close(); admin = undefined; await db?.close(); db = undefined; await fixture?.close(); fixture = undefined; });

const now = new Date("2026-09-04T12:00:00.000Z");
const context = { correlationId: "admin-test", ipAddress: null, userAgent: null };

async function seedAdmin(database: AuthDatabase, id: string): Promise<void> {
  await database.query("INSERT INTO users(id,email,name,password_hash,status,created_at,updated_at) VALUES($1,$2,'Admin','hash','active',$3,$3)", [id, `${id}@example.test`, now]);
  await database.query("INSERT INTO user_roles(user_id,role_key) VALUES($1,'admin')", [id]);
}

function statusCommand(targetUserId: string, status: "active" | "suspended" | "disabled"): ChangeUserStatusCommand {
  return { targetUserId, status, actorUserId: "operator", now, context, auditEvents: [{ correlationId: "admin-test", actorUserId: null, action: "user.status_changed", targetType: "user", targetId: targetUserId, result: "succeeded", reason: null, metadata: {}, context, occurredAt: now }] };
}

function accessCommand(targetUserId: string, roleKeys: string[], directPermissions: ReplaceUserAccessCommand["directPermissions"] = []): ReplaceUserAccessCommand {
  return { targetUserId, roleKeys, directPermissions, actorUserId: "operator", now, context, auditEvents: [{ correlationId: "admin-test", actorUserId: null, action: "access.changed", targetType: "user", targetId: targetUserId, result: "succeeded", reason: null, metadata: {}, context, occurredAt: now }] };
}

describeWithPostgres("PostgresUserRepository keeps one capable admin", () => {
  it("lets exactly one of two concurrent removals through, on two connections", async () => {
    fixture = await createPostgresTestDatabase(); db = createAuthDatabase({ connectionString: fixture.runtimeUrl });
    const first = ulid(); const second = ulid();
    await seedAdmin(db, first); await seedAdmin(db, second);
    const repository = new PostgresUserRepository(db);

    const outcomes = await Promise.all([
      repository.changeStatusPreservingCapableAdmin(statusCommand(first, "suspended")),
      repository.changeStatusPreservingCapableAdmin(statusCommand(second, "suspended")),
    ]);

    expect(outcomes.filter((outcome) => outcome === "updated")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome === "would_remove_last_admin")).toHaveLength(1);
    expect((await db.query("SELECT count(*)::int AS count FROM users WHERE status='active'")).rows[0]).toEqual({ count: 1 });
  });

  it("lets exactly one of two concurrent access replacements through", async () => {
    fixture = await createPostgresTestDatabase(); db = createAuthDatabase({ connectionString: fixture.runtimeUrl });
    const first = ulid(); const second = ulid();
    await seedAdmin(db, first); await seedAdmin(db, second);
    const repository = new PostgresUserRepository(db);

    const outcomes = await Promise.all([
      repository.replaceAccessPreservingCapableAdmin(accessCommand(first, ["member"])),
      repository.replaceAccessPreservingCapableAdmin(accessCommand(second, ["member"])),
    ]);

    expect(outcomes.filter((outcome) => outcome === "updated")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome === "would_remove_last_admin")).toHaveLength(1);
    expect((await db.query("SELECT count(*)::int AS count FROM user_roles WHERE role_key='admin'")).rows[0]).toEqual({ count: 1 });
  });

  it("treats a deny that removes any coverage as no longer a capable admin", async () => {
    fixture = await createPostgresTestDatabase(); db = createAuthDatabase({ connectionString: fixture.runtimeUrl });
    const only = ulid();
    await seedAdmin(db, only);
    const repository = new PostgresUserRepository(db);

    const outcome = await repository.replaceAccessPreservingCapableAdmin(accessCommand(only, ["admin"], [{ permission: "event:delete", effect: "deny" }]));

    expect(outcome).toBe("would_remove_last_admin");
    expect((await db.query("SELECT count(*)::int AS count FROM user_permissions WHERE user_id=$1", [only])).rows[0]).toEqual({ count: 0 });
  });

  it("revokes every session in the same commit that leaves active, and refuses terminal transitions", async () => {
    fixture = await createPostgresTestDatabase(); db = createAuthDatabase({ connectionString: fixture.runtimeUrl });
    admin = createAuthDatabase({ connectionString: fixture.adminUrl });
    const keeper = ulid(); const target = ulid();
    await seedAdmin(db, keeper); await seedAdmin(db, target);
    await db.query("INSERT INTO sessions(id,user_id,amr,auth_time,last_used_at,created_at) VALUES($1,$2,ARRAY['pwd','otp'],$3,$3,$3)", [ulid(), target, now]);
    const repository = new PostgresUserRepository(db);

    expect(await repository.changeStatusPreservingCapableAdmin(statusCommand(target, "suspended"))).toBe("updated");
    expect((await db.query("SELECT count(*)::int AS count FROM sessions WHERE revoked_at IS NULL")).rows[0]).toEqual({ count: 0 });
    expect((await admin.query("SELECT count(*)::int AS count FROM audit_log WHERE action='session.revoked_all'")).rows[0]).toEqual({ count: 1 });

    expect(await repository.changeStatusPreservingCapableAdmin(statusCommand(target, "disabled"))).toBe("updated");
    // `disabled` e terminal: nem voltar para active, nem repetir disabled.
    expect(await repository.changeStatusPreservingCapableAdmin(statusCommand(target, "active"))).toBe("invalid_status_transition");
    expect(await repository.changeStatusPreservingCapableAdmin(statusCommand(ulid(), "suspended"))).toBe("not_found");
  });

  it("pages the admin listing by id and never returns a sensitive field", async () => {
    fixture = await createPostgresTestDatabase(); db = createAuthDatabase({ connectionString: fixture.runtimeUrl });
    const ids = [ulid(), ulid(), ulid()].sort();
    for (const id of ids) await seedAdmin(db, id);
    await db.query("INSERT INTO user_permissions(user_id,permission,effect) VALUES($1,'event:delete','deny')", [ids[0]]);
    const repository = new PostgresUserRepository(db);

    const firstPage = await repository.listUsers({ cursor: null, limit: 2 });
    expect(firstPage.users.map((user) => user.id)).toEqual([ids[0], ids[1]]);
    expect(firstPage.nextCursor).toBe(ids[1]);
    expect(Object.keys(firstPage.users[0]!).sort()).toEqual(["createdAt", "directPermissions", "email", "id", "name", "roleKeys", "status", "updatedAt"]);
    expect(firstPage.users[0]).toMatchObject({ roleKeys: ["admin"], directPermissions: [{ permission: "event:delete", effect: "deny" }], status: "active" });

    const secondPage = await repository.listUsers({ cursor: firstPage.nextCursor, limit: 2 });
    expect(secondPage.users.map((user) => user.id)).toEqual([ids[2]]);
    expect(secondPage.nextCursor).toBeNull();
  });
});
