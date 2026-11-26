import { PostgresDeviceKeyRepository } from "../auth-core/persistence/postgres-device-key.repository";
import { PostgresUserRepository } from "../auth-core/persistence/postgres-user.repository";
import { SystemClock } from "../common/clock";
import { CryptoSecretGenerator } from "../common/secret-generator";
import { getRuntimeEnv } from "../config/env";
import { findMonorepoRoot, loadRootEnv } from "../config/load-env";
import { createAuthDatabase } from "../db/client";
import { IssueDeviceKeyUseCase } from "../features/device-keys/usecases/issue-device-key.usecase";
import { RevokeDeviceKeyUseCase } from "../features/device-keys/usecases/revoke-device-key.usecase";
import { parseDeviceKeyArgs } from "./device-key";

const context = { correlationId: "device-key-cli", ipAddress: null, userAgent: null };

async function main(): Promise<void> {
  const args = parseDeviceKeyArgs(process.argv.slice(2));
  const env = getRuntimeEnv(loadRootEnv(findMonorepoRoot(__dirname), process.env));
  const database = createAuthDatabase({ connectionString: env.databaseUrl });
  const keys = new PostgresDeviceKeyRepository(database);
  const clock = new SystemClock();
  try {
    if (args.command === "issue") {
      const issued = await new IssueDeviceKeyUseCase(new PostgresUserRepository(database), keys, clock, new CryptoSecretGenerator())
        .execute({ email: args.email, label: args.label, context });
      // A chave aparece uma unica vez: guarde-a no 1Password. So o hash fica no banco.
      process.stdout.write(`keyId=${issued.keyId}\nuserId=${issued.userId}\nkey=${issued.key}\n`);
    } else {
      const result = await new RevokeDeviceKeyUseCase(keys, clock).execute({ keyId: args.keyId, context });
      process.stdout.write(`${result}\n`);
      if (result === "not_found") process.exitCode = 1;
    }
  } finally {
    await database.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "device-key failed");
  process.exitCode = 1;
});
