import { randomBytes } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import { Clock } from "../common/clock";
import { SecretGenerator } from "../common/secret-generator";
import { ANONYMOUS_CONTEXT } from "../common/request-context";
import type { AuthDatabase } from "../db/client";
import { AUTH_DATABASE } from "../db/tokens";
import { BootstrapAdminUseCase } from "../features/invite-user/usecases/bootstrap-admin.usecase";
import { PostgresInviteRepository } from "../features/invite-user/postgres-invite.repository";
import { createPostgresTestDatabase, describeWithPostgres, type PostgresTestDatabase } from "../testing/postgres-test-database";
import { createTestApp, type TestApp } from "../testing/create-test-app";

let fixture: PostgresTestDatabase | undefined;
let app: TestApp | undefined;
afterEach(async () => {
  await app?.close(); app = undefined;
  await fixture?.close(); fixture = undefined;
});

describeWithPostgres("password-only invite HTTP journey", () => {
  it("accepts and activates an invite without phone fields", async () => {
    fixture = await createPostgresTestDatabase();
    app = await createTestApp({ AUTH_DATABASE_URL: fixture.runtimeUrl, AUTH_KEY_ENCRYPTION_KEY: randomBytes(32).toString("base64url") });
    const db = app.app.get<AuthDatabase>(AUTH_DATABASE);
    const bootstrap = new BootstrapAdminUseCase(app.app.get(PostgresInviteRepository), app.app.get(Clock), app.app.get(SecretGenerator));
    const created = await bootstrap.execute({ email: "admin@example.test", name: "Admin", context: ANONYMOUS_CONTEXT });
    expect(created.kind).toBe("created");
    const token = (created as { inviteToken: string }).inviteToken;

    const response = await fetch(`${app.url}/auth/invites/accept`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, password: "uma senha longa o suficiente aqui" }),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ accepted: true });
    expect((await db.query("SELECT status FROM users WHERE email='admin@example.test'")).rows[0]).toEqual({ status: "active" });
    expect((await db.query("SELECT accepted_at IS NOT NULL AS accepted FROM invites")).rows[0]).toEqual({ accepted: true });
  });
});
