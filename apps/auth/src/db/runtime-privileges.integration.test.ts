import { afterEach, expect, it } from "vitest";
import { createAuthTestDatabase, type AuthTestDatabase } from "../testing/sqlite-test-database";

// No Postgres o papel `auth_runtime` so podia inserir no `audit_log`. No SQLite nao ha papeis (ADR 0025): quem garante
// que a auditoria so cresce sao os triggers, e eles valem para qualquer conexao, inclusive a do servidor.
let fixture: AuthTestDatabase | undefined;
afterEach(async () => { await fixture?.close(); fixture = undefined; });

it("keeps audit_log append-only for every connection", async () => {
  fixture = await createAuthTestDatabase();
  const database = fixture.open();
  await database.query(
    "INSERT INTO audit_log (id, correlation_id, action, result, created_at) VALUES ('audit-1', 'c', 'login.failed', 'failed', $1)",
    [new Date()],
  );
  await expect(database.query("UPDATE audit_log SET action = 'login.succeeded'")).rejects.toThrow(/append-only/);
  await expect(database.query("DELETE FROM audit_log")).rejects.toThrow(/append-only/);
  await expect(database.transaction((tx) => tx.query("DELETE FROM audit_log WHERE id = 'audit-1'"))).rejects.toThrow(/append-only/);
  expect((await database.query("SELECT action FROM audit_log")).rows).toEqual([{ action: "login.failed" }]);
});
