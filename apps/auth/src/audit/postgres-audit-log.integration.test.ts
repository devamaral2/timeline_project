import { afterEach, expect, it } from "vitest";
import { PostgresAuditLog } from "./postgres-audit-log";
import { ANONYMOUS_CONTEXT } from "../common/request-context";
import { createAuthTestDatabase, type AuthTestDatabase } from "../testing/sqlite-test-database";

let fixture: AuthTestDatabase | undefined;
afterEach(async () => { await fixture?.close(); fixture = undefined; });

it("rejects secret-shaped audit metadata before persistence", async () => {
  fixture = await createAuthTestDatabase();
  const database = fixture.open();
  const audit = new PostgresAuditLog(database);
  await expect(audit.record({
    correlationId: "01k4a7w2f6m8r9t0v1x3y5z7ab",
    actorUserId: null, action: "login.failed", targetType: null, targetId: null,
    result: "failed", reason: "invalid credentials", metadata: { password: "canary" },
    context: ANONYMOUS_CONTEXT, occurredAt: new Date(),
  })).rejects.toThrow(/sensitive/i);
  expect((await database.query("SELECT id FROM audit_log")).rows).toEqual([]);
});
