import { getRuntimeEnv } from "../config/env";
import { findMonorepoRoot, loadRootEnv } from "../config/load-env";
import { createAuthDatabase } from "../db/client";
import { HttpPwnedPasswordsGateway } from "../auth-core/password/http-pwned-passwords.gateway";
import { PreparePassword } from "../auth-core/password/prepare-password";
import { ScryptPasswordHasher } from "../auth-core/password/scrypt-password-hasher";
import { normalizeEmail } from "../domain/users/user";
import { updatePassword } from "./update-password";

function parseArgs(values: string[]): { email: string } {
  if (values.length !== 2 || values[0] !== "--email" || !values[1]) {
    throw new Error("usage: password:update --email EMAIL (password from stdin)");
  }
  return { email: values[1] };
}

async function readPassword(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
}

async function main(): Promise<void> {
  const { email: rawEmail } = parseArgs(process.argv.slice(2));
  const email = normalizeEmail(rawEmail);
  const source = loadRootEnv(findMonorepoRoot(__dirname), process.env);
  const env = getRuntimeEnv(source);
  const database = createAuthDatabase({ connectionString: env.databaseUrl });
  try {
    const user = (await database.query<{ name: string; status: string }>(
      "SELECT name, status FROM users WHERE email = $1",
      [email],
    )).rows[0];
    if (!user || user.status !== "active") throw new Error("active user not found");

    const password = await readPassword();
    if (!password) throw new Error("password input is empty");
    const prepared = await new PreparePassword(
      new HttpPwnedPasswordsGateway(env.passwordBlocklistTimeoutMs),
      new ScryptPasswordHasher(),
    ).execute({ password, normalizedEmail: email, name: user.name });
    const result = await updatePassword(database, { email, passwordHash: prepared.passwordHash });
    process.stdout.write(`password updated for ${email}; revoked sessions=${result.revokedSessions}\n`);
  } finally {
    await database.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "password update failed");
  process.exitCode = 1;
});
