import { Client } from "pg";
import { expect, it } from "vitest";
import { PostgresAuditLog } from "./postgres-audit-log";
import { ANONYMOUS_CONTEXT } from "../common/request-context";

const databaseUrl = process.env.AUTH_TEST_DATABASE_URL;
const run = databaseUrl ? it : it.skip;

run("rejects secret-shaped audit metadata before persistence", async () => {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  const audit = new PostgresAuditLog(client);
  await expect(audit.record({
    correlationId: "01k4a7w2f6m8r9t0v1x3y5z7ab",
    actorUserId: null, action: "login.failed", targetType: null, targetId: null,
    result: "failed", reason: "invalid credentials", metadata: { password: "canary" },
    context: ANONYMOUS_CONTEXT, occurredAt: new Date(),
  })).rejects.toThrow(/sensitive/i);
  await client.end();
});
