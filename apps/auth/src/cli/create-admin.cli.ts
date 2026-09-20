import { insertAuditEvents } from "../audit/postgres-audit-log";
import { ANONYMOUS_CONTEXT } from "../common/request-context";
import { CryptoSecretGenerator } from "../common/secret-generator";
import { getRuntimeEnv } from "../config/env";
import { findMonorepoRoot, loadRootEnv } from "../config/load-env";
import { HttpPwnedPasswordsGateway } from "../features/basic-login/credentials/http-pwned-passwords.gateway";
import { PreparePassword } from "../features/basic-login/credentials/prepare-password";
import { ScryptPasswordHasher } from "../features/basic-login/credentials/scrypt-password-hasher";
import { createAuthDatabase } from "../db/client";
import { acquireAdvisoryLock, ADVISORY_LOCK } from "../db/transaction-locks";

const ADMIN_EMAIL = "admin@admin.com";
const ADMIN_NAME = "admin";

async function main(): Promise<void> {
  const source = loadRootEnv(findMonorepoRoot(__dirname), process.env);
  if (source.NODE_ENV === "production") {
    throw new Error("create-admin is disabled when NODE_ENV=production");
  }

  const password = source.ADMIN_PASSWORD;
  if (!password) throw new Error("ADMIN_PASSWORD is required");

  const env = getRuntimeEnv(source);
  const prepared = await new PreparePassword(
    new HttpPwnedPasswordsGateway(env.passwordBlocklistTimeoutMs),
    new ScryptPasswordHasher(),
  ).execute({ password, normalizedEmail: ADMIN_EMAIL, name: ADMIN_NAME });

  const database = createAuthDatabase({ connectionString: env.databaseUrl });
  const secrets = new CryptoSecretGenerator();
  const now = new Date();

  try {
    const result = await database.transaction(async (tx) => {
      await acquireAdvisoryLock(tx, ADVISORY_LOCK.bootstrapAdmin);

      const existing = await tx.query<{ id: string; status: string; is_admin: boolean }>(
        `SELECT u.id, u.status,
                EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id AND ur.role_key = 'admin') AS is_admin
           FROM users u
          WHERE u.email = $1
          FOR UPDATE`,
        [ADMIN_EMAIL],
      );

      if (existing.rows[0]) {
        const user = existing.rows[0];
        if (user.status !== "active" || !user.is_admin) {
          throw new Error(`${ADMIN_EMAIL} already exists but is not an active admin`);
        }
        await tx.query(
          "UPDATE users SET password_hash=$1, updated_at=$2 WHERE id=$3",
          [prepared.passwordHash, now, user.id],
        );
        await insertAuditEvents(tx, [{
          correlationId: "create-admin-cli",
          actorUserId: null,
          action: "password.changed",
          targetType: "user",
          targetId: user.id,
          result: "succeeded",
          reason: "create-admin-cli",
          metadata: { source: "create-admin-cli" },
          context: ANONYMOUS_CONTEXT,
          occurredAt: now,
        }]);
        return { kind: "password_reset" as const, userId: user.id };
      }

      const userId = secrets.randomId();
      await tx.query(
        "INSERT INTO users(id, email, name, password_hash, status, created_at, updated_at) VALUES($1, $2, $3, $4, 'active', $5, $5)",
        [userId, ADMIN_EMAIL, ADMIN_NAME, prepared.passwordHash, now],
      );
      await tx.query("INSERT INTO user_roles(user_id, role_key) VALUES($1, 'admin')", [userId]);
      await insertAuditEvents(tx, [{
        correlationId: "create-admin-cli",
        actorUserId: null,
        action: "bootstrap.admin_created",
        targetType: "user",
        targetId: userId,
        result: "succeeded",
        reason: null,
        metadata: { source: "create-admin-cli" },
        context: ANONYMOUS_CONTEXT,
        occurredAt: now,
      }]);
      return { kind: "created" as const, userId };
    });

    process.stdout.write(`admin=${result.kind} userId=${result.userId} email=${ADMIN_EMAIL}\n`);
  } finally {
    await database.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "admin creation failed");
  process.exitCode = 1;
});
