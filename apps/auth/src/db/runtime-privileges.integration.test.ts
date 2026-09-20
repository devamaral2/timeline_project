import { expect, it } from "vitest";
import { createPostgresTestDatabase } from "../testing/postgres-test-database";

const run = process.env.AUTH_TEST_DATABASE_URL ? it : it.skip;
run("creates a runtime identity that can only append audit records", async () => {
  const fixture = await createPostgresTestDatabase();
  try {
    const { Client } = await import("pg"); const runtime = new Client({ connectionString: fixture.runtimeUrl }); await runtime.connect();
    await expect(runtime.query("SELECT * FROM audit_log")).rejects.toThrow();
    await runtime.end();
  } finally { await fixture.close(); }
});
