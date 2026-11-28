import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createTestUserForFile } from "../../../testing/test-user";
import { ANONYMOUS_CONTEXT } from "../../../common/request-context";
import { ScryptPasswordHasher } from "../../../auth-core/password/scrypt-password-hasher";
import { createTestApp, type TestApp } from "../../../testing/create-test-app";
import { createAuthTestDatabase, type AuthTestDatabase } from "../../../testing/sqlite-test-database";
import type { AuthDatabase } from "../../../db/client";

const user = createTestUserForFile(__filename);
const password = "Integration-password-42!";

describe("password login HTTP flow", () => {
  let database: AuthTestDatabase;
  let app: TestApp;
  let admin: AuthDatabase;

  beforeAll(async () => {
    database = await createAuthTestDatabase();
    admin = database.open();
    const hash = await new ScryptPasswordHasher().hash(password);
    const now = new Date();
    await admin.query(
      "INSERT INTO users (id,email,name,password_hash,status,created_at,updated_at) VALUES ($1,$2,$3,$4,'active',$5,$5)",
      [user.id, user.email, user.name, hash, now],
    );
    app = await createTestApp({ AUTH_DATABASE_PATH: database.path });
    await app.core.signingKeyService.ensureActive(new Date(), {
      correlationId: "login-flow-test", actorUserId: null, action: "key.created",
      targetType: "signing_key", targetId: null, result: "succeeded",
      reason: null, metadata: {}, context: ANONYMOUS_CONTEXT, occurredAt: new Date(),
    });
  });

  afterAll(async () => {
    await app?.close();
    await database?.close();
  });

  test("rejects bad credentials without creating a session", async () => {
    const result = await fetch(`${app.url}/auth/login`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: user.email, password: "wrong-password" }),
    });
    expect(result.status).toBe(401);
    const sessions = await admin.query("SELECT id FROM sessions WHERE user_id=$1", [user.id]);
    expect(sessions.rows).toEqual([]);
  });

  test("issues tokens and commits a real session for the file user", async () => {
    const result = await fetch(`${app.url}/auth/login`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: user.email, password }),
    });
    expect(result.status).toBe(201);
    const body = await result.json() as { accessToken?: string; refreshToken?: string };
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();
    const sessions = await admin.query("SELECT user_id FROM sessions WHERE user_id=$1", [user.id]);
    expect(sessions.rows).toEqual([{ user_id: user.id }]);
  });
});
