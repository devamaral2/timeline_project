import { Client } from "pg";
import { expect, it } from "vitest";
import { createPostgresTestDatabase } from "../testing/postgres-test-database";

const run = process.env.AUTH_TEST_DATABASE_URL ? it : it.skip;
run("creates a runtime identity that can only append audit records", async () => {
  const fixture = await createPostgresTestDatabase();
  try {
    const runtime = new Client({ connectionString: fixture.runtimeUrl }); await runtime.connect();
    await expect(runtime.query("SELECT * FROM audit_log")).rejects.toThrow();
    await runtime.end();
  } finally { await fixture.close(); }
});

run("lets the runtime identity write signup_tokens, and any table created after the grant", async () => {
  const fixture = await createPostgresTestDatabase();
  const runtime = new Client({ connectionString: fixture.runtimeUrl });
  const owner = new Client({ connectionString: fixture.adminUrl });
  await runtime.connect(); await owner.connect();
  try {
    await runtime.query("INSERT INTO users (id, name, status, created_at, updated_at) VALUES ('p', 'admin_x', 'pending_sign_up', now(), now())");
    await runtime.query("INSERT INTO signup_tokens (id, jti, user_id, expires_at, created_at) VALUES ('t', 'j', 'p', now() + interval '1 hour', now())");
    await expect(runtime.query("UPDATE signup_tokens SET consumed_at = now() WHERE id = 't'")).resolves.toMatchObject({ rowCount: 1 });

    await owner.query("CREATE TABLE later_table (id text PRIMARY KEY)");
    await expect(runtime.query("INSERT INTO later_table (id) VALUES ('x')")).resolves.toMatchObject({ rowCount: 1 });
  } finally {
    await runtime.end(); await owner.end(); await fixture.close();
  }
});
