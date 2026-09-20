import { Client } from "pg";
import { ScryptPasswordHasher } from "../../apps/auth/src/features/basic-login/credentials/scrypt-password-hasher";
import { createTestUserForFile } from "../../apps/auth/src/testing/test-user";

export async function createE2eUserForFile(file: string) {
  const databaseUrl = process.env.E2E_AUTH_DATABASE_URL;
  if (!databaseUrl) throw new Error("E2E database was not started by Playwright globalSetup");
  const user = createTestUserForFile(file);
  const password = "E2e-test-password-42!";
  const hash = await new ScryptPasswordHasher().hash(password);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(
      "INSERT INTO users (id, email, name, password_hash, status, created_at, updated_at) VALUES ($1,$2,$3,$4,'active',now(),now())",
      [user.id, user.email, user.name, hash],
    );
    await client.query("INSERT INTO user_roles (user_id, role_key) VALUES ($1,'member')", [user.id]);
  } finally {
    await client.end();
  }
  return { ...user, password };
}
