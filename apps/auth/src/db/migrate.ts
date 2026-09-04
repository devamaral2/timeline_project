import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Pool } from "pg";

function quoteIdentifier(value: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error("Unsafe PostgreSQL identifier");
  return `"${value}"`;
}

const MIGRATION_FILE = /^\d{4}_[a-z0-9_]+\.sql$/;

/**
 * Aplica as migracoes pendentes, em ordem lexicografica do nome do arquivo.
 *
 * Duas escolhas que valem registro:
 *
 * - A lista de arquivos vem do diretorio, nunca de um array no codigo. A versao
 *   anterior enumerava `0000` e `0001` na mao, e por isso `0002` -- as tabelas
 *   de sessao, tentativa e recovery code -- nunca chegou a nenhum banco.
 * - Cada arquivo aplicado fica registrado em `applied_migrations`, dentro do
 *   schema de controle. E o que torna `db:migrate` seguro de repetir: sem o
 *   registro, rodar de novo reexecutaria um `CREATE TABLE` e falharia no meio.
 *
 * Cada migracao roda dentro da propria transacao, junto do registro dela: uma
 * migracao que falha nao deixa metade do DDL aplicado nem se declara aplicada.
 */
export async function migrateAuthDatabase(input: {
  migrationDatabaseUrl: string;
  migrationsFolder: string;
  migrationsSchema?: string;
  schema?: string;
}): Promise<void> {
  const pool = new Pool({ connectionString: input.migrationDatabaseUrl, max: 1 });
  try {
    const schema = quoteIdentifier(input.schema ?? "public");
    const migrationsSchema = quoteIdentifier(input.migrationsSchema ?? "drizzle");
    const client = await pool.connect();
    try {
      await client.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
      await client.query(`CREATE SCHEMA IF NOT EXISTS ${migrationsSchema}`);
      await client.query(`CREATE TABLE IF NOT EXISTS ${migrationsSchema}.applied_migrations (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
      await client.query(`SET search_path TO ${schema}`);

      const applied = new Set(
        (await client.query<{ filename: string }>(`SELECT filename FROM ${migrationsSchema}.applied_migrations`)).rows.map((row) => row.filename),
      );
      const pending = (await readdir(input.migrationsFolder)).filter((name) => MIGRATION_FILE.test(name) && !applied.has(name)).sort();

      for (const migration of pending) {
        const sql = await readFile(join(input.migrationsFolder, migration), "utf8");
        await client.query("BEGIN");
        try {
          await client.query(sql);
          await client.query(`INSERT INTO ${migrationsSchema}.applied_migrations (filename) VALUES ($1)`, [migration]);
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
      }
    } finally { client.release(); }
  } finally { await pool.end(); }
}
