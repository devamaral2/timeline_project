import { cleanupAuthData } from '../cleanup/cleanup-auth-data';
import { ANONYMOUS_CONTEXT } from '../common/request-context';
import { getRuntimeEnv } from '../config/env';
import { findMonorepoRoot, loadRootEnv } from '../config/load-env';
import { createAuthDatabase } from '../db/client';

async function main(): Promise<void> {
  const env = getRuntimeEnv(loadRootEnv(findMonorepoRoot(__dirname), process.env));
  const database = createAuthDatabase({ connectionString: env.databaseUrl });
  try {
    const result = await cleanupAuthData({ database, now: new Date(), context: { ...ANONYMOUS_CONTEXT, correlationId: 'cleanup-auth-data' } });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await database.close();
  }
}
void main().catch(() => { process.exitCode = 1; });
