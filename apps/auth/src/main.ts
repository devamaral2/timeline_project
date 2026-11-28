import { startAuth } from './composition-root';
import { getRuntimeEnv } from './config/env';
import { findMonorepoRoot, loadRootEnv } from './config/load-env';

async function bootstrap(): Promise<void> {
  const env = getRuntimeEnv(
    loadRootEnv(findMonorepoRoot(__dirname), process.env),
  );
  const runtime = await startAuth(env);
  process.stdout.write(`Auth listening on ${runtime.url}\n`);

  let closing = false;
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (closing) return;
    closing = true;
    process.stdout.write(`Auth shutting down after ${signal}\n`);
    await runtime.close();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

void bootstrap();
