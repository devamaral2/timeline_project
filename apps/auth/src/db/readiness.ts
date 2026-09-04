import type { AuthDatabase } from './client';
import { RequiredDependencyUnavailableError } from '../common/errors';
export async function checkReadiness(
  db: AuthDatabase,
  expectedVersion = 2,
): Promise<void> {
  try {
    await db.query('SELECT 1');
    const result = await db.query(
      'SELECT version FROM auth_schema_meta WHERE singleton = true',
    );
    if (result.rows[0]?.version !== expectedVersion)
      throw new Error('schema version is not ready');
    const active = await db.query(
      "SELECT 1 FROM signing_keys WHERE status = 'active' AND encrypted_private_key IS NOT NULL",
    );
    if (active.rowCount !== 1)
      throw new Error('active signing key is not ready');
  } catch (cause) {
    throw new RequiredDependencyUnavailableError('database unavailable', {
      cause,
    });
  }
}

/**
 * A versao que as migracoes deixam gravada em `auth_schema_meta`. Vive aqui
 * porque e ela que o `/health/ready` compara: um deploy que sobe o codigo novo
 * antes de rodar `db:migrate` precisa falhar no readiness em vez de atender
 * pela metade. Cada migracao nova sobe este numero junto com o seu `UPDATE`.
 */
export const AUTH_SCHEMA_VERSION = 3;
