import 'reflect-metadata';
import { SystemClock } from '../common/clock';
import { ConflictError, NotFoundError } from '../common/errors';
import { CryptoSecretGenerator } from '../common/secret-generator';
import { getRuntimeEnv } from '../config/env';
import { findMonorepoRoot, loadRootEnv } from '../config/load-env';
import { PostgresSigningKeyRepository } from '../crypto/postgres-signing-key.repository';
import { SigningKeyService } from '../crypto/signing-key.service';
import { createAuthDatabase } from '../db/client';
import { PostgresSignupTokenRepository } from '../signup/postgres-signup-token.repository';
import { CreateSignupLinkUseCase } from '../signup/usecases/create-signup-link.usecase';

const USAGE = 'usage: bootstrap-admin [--reissue USER_ID]';

export function parseBootstrapArgs(argv: readonly string[]): { reissueUserId?: string } {
  if (argv.length === 0) return {};
  if (argv.length === 2 && argv[0] === '--reissue' && argv[1]) return { reissueUserId: argv[1] };
  throw new Error(USAGE);
}

/**
 * Emite um link de signup de administrador. A chave de assinatura e garantida
 * aqui mesmo (`ensureActive`): num banco recem-migrado o script funciona sem
 * que o servico tenha subido antes.
 */
async function main(): Promise<void> {
  const args = parseBootstrapArgs(process.argv.slice(2));
  const env = getRuntimeEnv(loadRootEnv(findMonorepoRoot(__dirname), process.env));
  const db = createAuthDatabase({ connectionString: env.databaseUrl });
  try {
    const secrets = new CryptoSecretGenerator();
    const keys = new SigningKeyService(new PostgresSigningKeyRepository(db), env.keyEncryptionKey, secrets);
    const clock = new SystemClock();
    await keys.ensureActive(clock.now());
    const result = await new CreateSignupLinkUseCase(new PostgresSignupTokenRepository(db), keys, clock, secrets, {
      issuer: env.issuer,
      audience: env.audience,
      webAppUrl: env.webAppUrl,
    }).execute(args);
    process.stdout.write(`outcome=${result.outcome}\nuserId=${result.userId}\nexpiresAt=${result.expiresAt.toISOString()}\nlink=${result.link}\n`);
  } finally {
    await db.close();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    const message = error instanceof NotFoundError ? 'no such pending user'
      : error instanceof ConflictError ? 'user already completed signup; nothing to reissue'
      : error instanceof Error && error.message === USAGE ? USAGE
      : 'bootstrap-admin failed';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
