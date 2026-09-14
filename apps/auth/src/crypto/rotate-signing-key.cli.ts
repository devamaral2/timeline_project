import 'reflect-metadata';
import { createAuthDatabase } from '../db/client';
import { getRuntimeEnv } from '../config/env';
import { findMonorepoRoot, loadRootEnv } from '../config/load-env';
import { PostgresSigningKeyRepository } from './postgres-signing-key.repository';
import { SigningKeyService } from './signing-key.service';
import { CryptoSecretGenerator } from '../common/secret-generator';

async function main(): Promise<void> {
  const env = getRuntimeEnv(
    loadRootEnv(findMonorepoRoot(__dirname), process.env),
  );
  const db = createAuthDatabase({ connectionString: env.databaseUrl });
  try {
    const now = new Date();
    const key = await new SigningKeyService(
      new PostgresSigningKeyRepository(db),
      env.keyEncryptionKey,
      new CryptoSecretGenerator(),
    ).rotate(now);
    console.log(
      JSON.stringify({
        kid: key.kid,
        status: key.status,
        createdAt: key.createdAt.toISOString(),
      }),
    );
  } finally {
    await db.close();
  }
}
void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'rotation failed');
  process.exitCode = 1;
});
