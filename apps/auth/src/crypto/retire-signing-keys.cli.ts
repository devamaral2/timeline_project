import 'reflect-metadata';
import { createAuthDatabase } from '../db/client';
import { getRuntimeEnv } from '../config/env';
import { findMonorepoRoot, loadRootEnv } from '../config/load-env';
import { PostgresSigningKeyRepository } from './postgres-signing-key.repository';
import { SigningKeyService } from './signing-key.service';
import { CryptoSecretGenerator } from '../common/secret-generator';

/** Aposenta agora toda chave `retiring` cujo `retire_after` ja passou. */
async function main(): Promise<void> {
  const env = getRuntimeEnv(loadRootEnv(findMonorepoRoot(__dirname), process.env));
  const db = createAuthDatabase({ connectionString: env.databaseUrl });
  try {
    const retired = await new SigningKeyService(new PostgresSigningKeyRepository(db), env.keyEncryptionKey, new CryptoSecretGenerator()).retireExpired(new Date());
    console.log(JSON.stringify({ retired }));
  } finally {
    await db.close();
  }
}
void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'retirement failed');
  process.exitCode = 1;
});
