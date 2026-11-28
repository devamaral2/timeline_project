import { ScryptPasswordHasher } from "../../apps/auth/src/auth-core/password/scrypt-password-hasher";
import { openAuthDatabase } from "../../apps/auth/src/db/client";
import { createTestUserForFile } from "../../apps/auth/src/testing/test-user";

export async function createE2eUserForFile(file: string) {
  const databasePath = process.env.E2E_AUTH_DATABASE_PATH;
  if (!databasePath) throw new Error("E2E database was not started by Playwright globalSetup");
  const user = createTestUserForFile(file);
  const password = "E2e-test-password-42!";
  const hash = await new ScryptPasswordHasher().hash(password);
  // O mesmo arquivo SQLite que o auth do e2e usa (ADR 0025): a escrita espera a vez, como entre servidor e CLI.
  const database = openAuthDatabase(databasePath);
  try {
    const now = new Date();
    await database.transaction(async (tx) => {
      await tx.query(
        "INSERT INTO users (id, email, name, password_hash, status, created_at, updated_at) VALUES ($1,$2,$3,$4,'active',$5,$5)",
        [user.id, user.email, user.name, hash, now],
      );
      await tx.query("INSERT INTO user_roles (user_id, role_key) VALUES ($1,'member')", [user.id]);
    });
  } finally {
    await database.close();
  }
  return { ...user, password };
}
